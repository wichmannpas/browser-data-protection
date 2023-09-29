const { VueLoaderPlugin } = require("vue-loader");

module.exports = {
  webpack: (config, { dev, vendor }) => {
    config['module']['rules'].push({
      test: /\.rawjs$/i,
      type: 'asset/source',
    })

    // Vue.js
    for (let i = 0; i < config['module']['rules'].length; i++) {
      if (config['module']['rules'][i]['test'].toString().indexOf('.tsx') >= 0) {
        // config['module']['rules'][i].test = /(?<!\.d)\.tsx?$/
        config['module']['rules'][i].options = {
          appendTsSuffixTo: [/\.vue$/]
        }
        break
      }
    }
    config['module']['rules'].push({
      test: /\.vue$/i,
      loader: 'vue-loader',
      options: {
        esModule: true
      }
    })
    config['plugins'].push(
      new VueLoaderPlugin()
    )

    return config;
  },
};