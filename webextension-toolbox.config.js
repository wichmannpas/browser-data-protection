module.exports = {
  webpack: (config, { dev, vendor }) => {
    config['module']['rules'].push({
      test: /\.rawjs$/i,
      type: 'asset/source',
    })

    return config;
  },
};