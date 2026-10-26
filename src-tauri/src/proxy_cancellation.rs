use futures_util::future::{AbortHandle, AbortRegistration};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(Clone, Default)]
pub struct ProxyRequests(Arc<Mutex<HashMap<String, AbortHandle>>>);

pub struct RequestGuard {
    requests: ProxyRequests,
    id: String,
}

impl ProxyRequests {
    pub fn register(&self, id: String) -> Result<(RequestGuard, AbortRegistration), String> {
        let mut requests = self.0.lock().map_err(|_| "代理请求注册不可用")?;
        if requests.contains_key(&id) {
            return Err("重复的代理请求 ID".into());
        }
        let (handle, registration) = AbortHandle::new_pair();
        requests.insert(id.clone(), handle);
        Ok((RequestGuard { requests: self.clone(), id }, registration))
    }

    pub fn cancel(&self, id: &str) -> Result<(), String> {
        if let Some(handle) = self.0.lock().map_err(|_| "代理请求注册不可用")?.get(id) {
            handle.abort();
        }
        Ok(())
    }
}

impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Ok(mut requests) = self.requests.0.lock() {
            requests.remove(&self.id);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use futures_util::future::{pending, Abortable};
    use futures_util::task::noop_waker;
    use std::future::Future;
    use std::task::{Context, Poll};

    #[test]
    fn cancellation_is_isolated_and_cleanup_is_scoped() {
        let requests = ProxyRequests::default();
        let (guard_a, reg_a) = requests.register("a".into()).unwrap();
        let (guard_b, reg_b) = requests.register("b".into()).unwrap();
        assert!(requests.register("a".into()).is_err());
        let mut a = Box::pin(Abortable::new(pending::<()>(), reg_a));
        let mut b = Box::pin(Abortable::new(pending::<()>(), reg_b));
        let waker = noop_waker();
        let mut cx = Context::from_waker(&waker);
        requests.cancel("a").unwrap();
        assert!(matches!(a.as_mut().poll(&mut cx), Poll::Ready(Err(_))));
        assert!(b.as_mut().poll(&mut cx).is_pending());
        drop(guard_a);
        assert!(!requests.0.lock().unwrap().contains_key("a"));
        requests.cancel("a").unwrap();
        drop(guard_b);
        assert!(requests.0.lock().unwrap().is_empty());
    }
}
