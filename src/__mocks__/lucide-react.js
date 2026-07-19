// Mock for lucide-react icons
const handler = {
  get: (target, prop) => {
    if (prop === '__esModule') return true;
    if (typeof prop === 'string') {
      return React.forwardRef((props, ref) => (
        React.createElement('span', { ref, 'data-icon': prop, ...props })
      ));
    }
    return undefined;
  }
};

const React = require('react');
module.exports = new Proxy({}, handler);
module.exports.default = module.exports;
