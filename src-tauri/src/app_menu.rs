use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    Emitter, Manager,
};

const IMPORT_HTML_ID: &str = "import-html";
const IMPORT_HTML_EVENT: &str = "menu:import-html";
const DESIGN_TASKS_ID: &str = "design-tasks";
const DESIGN_TASKS_EVENT: &str = "menu:design-tasks";

pub struct ImportMenuState(MenuItem<tauri::Wry>);
pub struct DesignTasksMenuState(MenuItem<tauri::Wry>);

pub fn install(app: &mut tauri::App) -> tauri::Result<()> {
    let menu = Menu::default(app.handle())?;
    let item = MenuItem::with_id(app, IMPORT_HTML_ID, "导入 HTML…", false, None::<&str>)?;
    let tasks = MenuItem::with_id(app, DESIGN_TASKS_ID, "未完成设计…", false, None::<&str>)?;
    let file_menu = menu.items()?.into_iter().find_map(|item| {
        item.as_submenu()
            .filter(|submenu| submenu.text().ok().as_deref() == Some("File"))
            .cloned()
    });
    if let Some(file_menu) = file_menu {
        file_menu.insert(&item, 0)?;
        file_menu.insert(&tasks, 1)?;
        file_menu.insert(&PredefinedMenuItem::separator(app)?, 2)?;
    } else {
        let file_menu = Submenu::with_items(app, "File", true, &[&item,&tasks])?;
        menu.insert(&file_menu, if cfg!(target_os = "macos") { 1 } else { 0 })?;
    }
    app.set_menu(menu)?;
    app.manage(ImportMenuState(item));
    app.manage(DesignTasksMenuState(tasks));
    Ok(())
}

pub fn handle_event(app: &tauri::AppHandle, event: tauri::menu::MenuEvent) {
    if event.id().as_ref() == IMPORT_HTML_ID {
        if let Err(error) = app.emit_to("main", IMPORT_HTML_EVENT, ()) {
            log::warn!("无法打开 HTML 导入: {error}");
        }
    }
    if event.id().as_ref() == DESIGN_TASKS_ID {
        if let Err(error) = app.emit_to("main", DESIGN_TASKS_EVENT, ()) {log::warn!("无法打开设计任务: {error}");}
    }
}

#[tauri::command]
pub fn set_design_tasks_menu_enabled(window:tauri::WebviewWindow,state:tauri::State<'_,DesignTasksMenuState>,enabled:bool)->Result<(),String>{
    if window.label()!="main"{return Err("仅主窗口可更新设计任务菜单".into());}
    state.0.set_enabled(enabled).map_err(|error|error.to_string())
}

#[tauri::command]
pub fn set_html_import_menu_enabled(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, ImportMenuState>,
    enabled: bool,
) -> Result<(), String> {
    if window.label() != "main" {
        return Err("仅主窗口可更新导入菜单".into());
    }
    state
        .0
        .set_enabled(enabled)
        .map_err(|error| error.to_string())
}
