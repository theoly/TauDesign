import { describe, expect, it } from 'bun:test';
import { buildDesignProjectManifest, renderProjectManifestContext } from '../src/services/ai/projectManifest';
import type { Screen } from '../src/types/project';
import { referencedProjectAssets, verifyProjectAssetFiles } from '../src/services/ai/projectAssetIntegrity';
import type { ProjectStorage } from '../src/services/storage/projectStorage';

const page = (id: string, htmlContent: string, position = { x: 0, y: 0 }): Screen => ({
  id, name: id, htmlContent, position
});

describe('derived project manifest', () => {
  it('builds the page relationship map from stored page HTML without another persistence source', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile',
      screens: [page('home', '<a data-target-screen-id="detail">详情</a>'), page('detail', '<main>详情</main>')], assets: [] });
    expect(manifest.pages[0].outgoingPageIds).toEqual(['detail']);
    expect(manifest.issues).toEqual([]);
    expect(renderProjectManifestContext(manifest)).toContain('工程「CRM」(mobile)');
    expect(renderProjectManifestContext(manifest)).toContain('页面跳转关系：home → detail');
  });

  it('reports broken page links, invalid coordinates and unsafe asset paths', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'pc',
      screens: [page('home', '<a data-target-screen-id="missing">去往</a>', { x: Number.NaN, y: 0 })],
      assets: [{ id: 'asset-1', name: '图片', type: 'image', mimeType: 'image/png', source: 'upload', relPath: '../outside.png', refCount: 1 }] });
    expect(manifest.issues.map(issue => issue.code)).toEqual(['invalid_screen_position', 'invalid_asset_path', 'unresolved_page_link']);
  });

  it('reports unregistered image and CSS resources plus explicit broken asset IDs', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'Assets', deviceProfile: 'mobile',
      screens: [page('home', '<img data-asset-id="missing" src="assets/images/unregistered.png"><style>@font-face{src:url(assets/imports/fonts/face.woff2)}.hero{background:url(assets/images/registered.png)}</style>')],
      assets: [{ id: 'registered', name: '背景', type: 'image', mimeType: 'image/png', source: 'upload', relPath: 'assets/images/registered.png', refCount: 1 }] });
    expect(manifest.issues.map(issue => issue.code)).toEqual(['unresolved_asset_id', 'unregistered_asset_reference']);
  });

  it('checks the physical project storage before treating registered files as available', async () => {
    const asset = { id: 'a', name: '头像', type: 'image' as const, mimeType: 'image/png', source: 'upload' as const,
      relPath: 'assets/images/avatar.png', refCount: 1 };
    const storage = { exists: async (path: string) => path !== asset.relPath } as ProjectStorage;
    expect((await verifyProjectAssetFiles(storage, [asset])).map(issue => issue.code)).toEqual(['missing_asset_file']);
    const unavailable = { exists: async () => { throw new Error('disk offline'); } } as unknown as ProjectStorage;
    expect((await verifyProjectAssetFiles(unavailable, [asset])).map(issue => issue.code)).toEqual(['asset_check_unavailable']);
    expect((await verifyProjectAssetFiles(storage, [{ ...asset, relPath: 'assets/images/../escape.png' }])).map(issue => issue.code)).toEqual(['invalid_asset_path']);
  });

  it('selects all files used by final HTML, including asset IDs and CSS URLs but excluding unrelated assets', () => {
    const assets = ['avatar', 'background', 'unused'].map(id => ({ id, name: id, type: 'image' as const,
      mimeType: 'image/png', source: 'upload' as const, relPath: `assets/images/${id}.png`, refCount: 1 }));
    const screen = page('candidate', '<img data-asset-id="avatar"><style>.hero{background:url(assets/images/background.png)}</style>');
    expect(referencedProjectAssets(screen, assets).map(asset => asset.id)).toEqual(['avatar', 'background']);
  });

  it('bounds prompt context for large projects while retaining the total page count', () => {
    const screens = Array.from({ length: 25 }, (_, index) => page(`page-${index}`, '<main>Page</main>'));
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'Large', deviceProfile: 'pc', screens, assets: [] });
    const context = renderProjectManifestContext(manifest);
    expect(context).toContain('另有 5 个页面未列出');
    expect(context).toContain('组件 0 个（暂无组件）；资源 0 个');
  });

  it('tracks reusable component identities and reports missing or stale instances', () => {
    const components = [{ id: 'comp-card', name: '信息卡', templateHtml: '<article></article>', createdAt: 1, updatedAt: 2, version: 3, origin: { kind: 'extracted' as const, sourceScreenId: 'home', sourceNid: 'card' } }];
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile',
      screens: [page('home', '<article data-component-id="comp-card" data-component-version="2"></article><button data-component-id="deleted">删除</button>')], assets: [], components });
    expect(manifest.pages[0].componentIds).toEqual(['comp-card', 'deleted']);
    expect(manifest.components).toEqual([{ id: 'comp-card', name: '信息卡', version: 3, origin: 'extracted' }]);
    expect(manifest.issues.map(issue => issue.code)).toEqual(['stale_component_instance', 'unresolved_component_reference']);
    expect(renderProjectManifestContext(manifest)).toContain('信息卡 v3');
  });

  it('captures navigation, action, form field and observable state controls for workflow context', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile', assets: [],
      screens: [page('home', '<a data-target-screen-id="detail" data-nid="nav001">查看详情</a><button data-nid="save01" aria-pressed="false">保存</button><label for="email">邮箱</label><input id="email" name="email" type="email" placeholder="输入邮箱"><select aria-label="状态"><option>待处理</option></select>')] });
    expect(manifest.pages[0].interactions.map(({ kind, label }) => [kind, label])).toEqual([
      ['navigation', '查看详情'], ['action', '保存'], ['field', '邮箱'], ['field', '状态']
    ]);
    expect(manifest.pages[0].interactions[1].stateSignals).toEqual(['aria-pressed']);
    expect(manifest.pages[0].interactions[3].stateSignals).toEqual(['selected-option']);
    expect(renderProjectManifestContext(manifest)).toContain('页面交互清单：home(4项');
    expect(renderProjectManifestContext(manifest)).toContain('action:保存[aria-pressed]');
  });

  it('groups form fields and submit actions, including submit controls associated from outside the form', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile', assets: [],
      screens: [page('login', '<h2>登录</h2><form id="login-form" method="post" action="/login"><label for="email">邮箱</label><input id="email" name="email" type="email" required><label for="password">密码</label><input id="password" name="password" type="password" required></form><button type="submit" form="login-form">登录</button>')] });
    expect(manifest.pages[0].forms).toEqual([{
      id: 'login-form', label: 'login-form', method: 'post', action: '/login',
      fields: [
        { name: 'email', type: 'email', label: '邮箱', required: true },
        { name: 'password', type: 'password', label: '密码', required: true }
      ],
      submitActions: [{ label: '登录' }]
    }]);
    expect(manifest.issues).toEqual([]);
    expect(renderProjectManifestContext(manifest)).toContain('表单契约：login：login-form(post /login；字段 email:邮箱/email必填、password:密码/password必填；提交 登录)');
  });

  it('reports incomplete navigation, form and accessible state references as advisory findings', () => {
    const manifest = buildDesignProjectManifest({ projectId: 'p1', projectName: 'CRM', deviceProfile: 'mobile', assets: [],
      screens: [page('form', '<a href="#missing">跳转</a><button aria-controls="absent"></button><form><label for="phone">手机号</label><input id="phone" name="phone"></form>')] });
    expect(manifest.issues.map(issue => issue.code)).toEqual([
      'interactive_control_unlabeled', 'form_missing_submit_action', 'unresolved_fragment_link', 'unresolved_aria_controls'
    ]);
    expect(manifest.issues.every(issue => issue.severity === 'warning')).toBe(true);
    expect(renderProjectManifestContext(manifest)).toContain('没有可访问名称');
  });
});
