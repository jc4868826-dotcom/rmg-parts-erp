const Router = {
  routes: {},

  on(pattern, handler) {
    this.routes[pattern] = handler;
    return this;
  },

  navigate(path) {
    window.location.hash = path;
  },

  init() {
    window.addEventListener('hashchange', () => this._handle());
    this._handle();
  },

  _handle() {
    const hash = (window.location.hash.slice(1) || '/').split('?')[0];
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const paramNames = [];
      const regexStr = pattern.replace(/:([^/]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      });
      const match = hash.match(new RegExp(`^${regexStr}$`));
      if (match) {
        const params = {};
        paramNames.forEach((name, i) => { params[name] = decodeURIComponent(match[i + 1]); });
        handler(params);
        return;
      }
    }
    if (this.routes['/']) this.routes['/']({});
  }
};
