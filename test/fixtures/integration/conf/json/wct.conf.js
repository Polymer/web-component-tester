var path = require('path');

module.exports = {
  root: path.resolve(__dirname, '..'),
  plugins: {
    sauce: {
      username: 'jsconf',
    },
  },
};
