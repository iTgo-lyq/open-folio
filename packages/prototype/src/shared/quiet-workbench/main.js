// 启动：没有 hash 时进入入口页面。
if (!location.hash) history.replaceState(null, "", "#/" + document.body.dataset.start);
parseHash();
render();
