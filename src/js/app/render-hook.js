// Late-binding seam so extracted modules can call the render orchestrator
// while it still lives in app.js. Session 6B deletes this file once
// render() lives in js/app/render.js and can be imported directly.
let impl = () => {};
function setRenderImpl(fn) { impl = fn; }
function render() { return impl(); }

export { render, setRenderImpl };
