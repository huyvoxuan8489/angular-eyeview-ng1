const helpers = require('./helpers');
const webpackMerge = require('webpack-merge'); // used to merge webpack configs
const commonConfig = require('./webpack.common.js'); // the settings that are common to prod and dev
const deployConfig = require('./deploy.config');
const argvs = process.argv.splice(2);
let deployProfile = deployConfig.envs['nois'];
if (argvs.filter((e) => {
    return /^--env\.profile/.test(e);
  }).length) {
  // get argument --env.profile value
  let targetProfile = argvs.filter((e) => {
    return /^--env\.profile/.test(e);
  })[0].split('=')[1];

  // get deploy profile
  if (deployConfig.envs[targetProfile]) {
    deployProfile = deployConfig.envs[targetProfile];
  }
}

/**
 * Webpack Plugins
 */
const ProvidePlugin = require('webpack/lib/ProvidePlugin');
const DefinePlugin = require('webpack/lib/DefinePlugin');
const NormalModuleReplacementPlugin = require('webpack/lib/NormalModuleReplacementPlugin');
const IgnorePlugin = require('webpack/lib/IgnorePlugin');
const DedupePlugin = require('webpack/lib/optimize/DedupePlugin');
const UglifyJsPlugin = require('webpack/lib/optimize/UglifyJsPlugin');
const WebpackMd5Hash = require('webpack-md5-hash');
const OptimizeCssAssetsPlugin = require('optimize-css-assets-webpack-plugin');
const OptimizeJsonAssetsPlugin = require('./optimize-json-assets-webpack-plugin');
const LoaderOptionsPlugin = require('webpack/lib/LoaderOptionsPlugin');
const CompressionPlugin = require('compression-webpack-plugin');

/**
 * Webpack Constants
 */
const ENV = process.env.NODE_ENV = process.env.ENV = 'production';
const HOST = process.env.HOST || 'localhost';
const PORT = process.env.PORT || 8080;
const METADATA = webpackMerge(commonConfig.metadata, {
  host: HOST,
  port: PORT,
  ENV: ENV,
  HMR: false
});

module.exports = webpackMerge(commonConfig, {

  /**
   * Developer tool to enhance debugging
   *
   * See: http://webpack.github.io/docs/configuration.html#devtool
   * See: https://github.com/webpack/docs/wiki/build-performance#sourcemaps
   */
  devtool: 'source-map',

  /**
   * Options affecting the output of the compilation.
   *
   * See: http://webpack.github.io/docs/configuration.html#output
   */
  output: {

    /**
     * The output directory as absolute path (required).
     *
     * See: http://webpack.github.io/docs/configuration.html#output-path
     */
    path: helpers.root('dist'),

    /**
     * Specifies the name of each output file on disk.
     * IMPORTANT: You must not specify an absolute path here!
     *
     * See: http://webpack.github.io/docs/configuration.html#output-filename
     */
    filename: '[name].[chunkhash].bundle.js',

    /**
     * The filename of the SourceMaps for the JavaScript files.
     * They are inside the output.path directory.
     *
     * See: http://webpack.github.io/docs/configuration.html#output-sourcemapfilename
     */
    sourceMapFilename: '[name].[chunkhash].bundle.map',

    /**
     * The filename of non-entry chunks as relative path
     * inside the output.path directory.
     *
     * See: http://webpack.github.io/docs/configuration.html#output-chunkfilename
     */
    chunkFilename: '[id].[chunkhash].chunk.js',

    // publicPath: "https://imsstaging.azureedge.net/"
  },

  module: {
    rules: [
      {
        test: /config\.js$/,
        use: [
          {
            loader: 'string-replace-loader',
            query: {
              multiple: [
                {
                  search: "domain:(\\s)?('|\").*('|\")",
                  replace: 'domain: \'' + deployProfile.domain + '\'',
                  flags: 'gi'
                },
                {
                  search: "\\('signalRServer'\\,\\s'.*'\\)",
                  replace: '(\'signalRServer\', \'' + deployProfile.domain + '\')',
                  flags: 'gi'
                },
                {
                  search: "\\('socketioNamespace'\\,\\s'.*'\\)",
                  replace: '(\'socketioNamespace\', \'' + deployProfile.socketioNamespace + '\')',
                  flags: 'gi'
                }
              ]
            }
          }
        ]
      },

      {
        test: /provider\.js$/,
        use: [
          {
            loader: 'string-replace-loader',
            query: {
              multiple: [
                {
                  search: '\\$logProvider\\.debugEnabled\\(true\\)\\;',
                  replace: '$logProvider.debugEnabled(false);',
                  flags: 'gi'
                }
              ]
            }
          }
        ]
      },

      /* Raw loader support for *.html
       * Returns file content as string
       *
       * See: https://github.com/webpack/raw-loader
       */
      {
        test: /(common|modules).*\.html$/,
        use: 'file-loader?name=/assets/templates/[hash].[ext]',
        exclude: [helpers.root('src/index.html'), /node_modules/]
      },
      {
        test: /\.html$/,
        use: 'raw-loader',
        exclude: [helpers.root('src/index.html'), /javascripts/]
      }
    ]
  },

  /**
   * Add additional plugins to the compiler.
   *
   * See: http://webpack.github.io/docs/configuration.html#plugins
   */
  plugins: [

    /**
     * Plugin: WebpackMd5Hash
     * Description: Plugin to replace a standard webpack chunkhash with md5.
     *
     * See: https://www.npmjs.com/package/webpack-md5-hash
     */
    new WebpackMd5Hash(),

    /**
     * Plugin: DedupePlugin
     * Description: Prevents the inclusion of duplicate code into your bundle
     * and instead applies a copy of the function at runtime.
     *
     * See: https://webpack.github.io/docs/list-of-plugins.html#defineplugin
     * See: https://github.com/webpack/docs/wiki/optimization#deduplication
     */
    // new DedupePlugin(), // see: https://github.com/angular/angular-cli/issues/1587

    /**
     * Plugin: DefinePlugin
     * Description: Define free variables.
     * Useful for having development builds with debug logging or adding global constants.
     *
     * Environment helpers
     *
     * See: https://webpack.github.io/docs/list-of-plugins.html#defineplugin
     */
    // NOTE: when adding more properties make sure you include them in custom-typings.d.ts
    new DefinePlugin({
      'ENV': JSON.stringify(METADATA.ENV),
      'HMR': METADATA.HMR,
      'process.env': {
        'ENV': JSON.stringify(METADATA.ENV),
        'NODE_ENV': JSON.stringify(METADATA.ENV),
        'HMR': METADATA.HMR,
      }
    }),

    /**
     * Plugin: UglifyJsPlugin
     * Description: Minimize all JavaScript output of chunks.
     * Loaders are switched into minimizing mode.
     *
     * See: https://webpack.github.io/docs/list-of-plugins.html#uglifyjsplugin
     */
    // NOTE: To debug prod builds uncomment //debug lines and comment //prod lines
    new UglifyJsPlugin({
      // beautify: true, //debug
      // mangle: false, //debug
      // dead_code: false, //debug
      // unused: false, //debug
      // deadCode: false, //debug
      // compress: {
      //   screw_ie8: true,
      //   keep_fnames: true,
      //   drop_debugger: false,
      //   dead_code: false,
      //   unused: false
      // }, // debug
      // comments: true, //debug


      beautify: false, //prod
      mangle: {screw_ie8: true, keep_fnames: true}, //prod
      compress: {screw_ie8: true}, //prod
      comments: false //prod
    }),

    /**
     * Plugin: NormalModuleReplacementPlugin
     * Description: Replace resources that matches resourceRegExp with newResource
     *
     * See: http://webpack.github.io/docs/list-of-plugins.html#normalmodulereplacementplugin
     */

    // new NormalModuleReplacementPlugin(
    //   /angular2-hmr/,
    //   helpers.root('config/modules/angular2-hmr-prod.js')
    // ),

    /**
     * Plugin: IgnorePlugin
     * Description: Don’t generate modules for requests matching the provided RegExp.
     *
     * See: http://webpack.github.io/docs/list-of-plugins.html#ignoreplugin
     */

    // new IgnorePlugin(/angular2-hmr/),

    new OptimizeCssAssetsPlugin({
      assetNameRegExp: /styles.*\.css$/g,
      cssProcessor: require('cssnano'),
      cssProcessorOptions: {discardComments: {removeAll: true}},
      canPrint: true
    }),
    new OptimizeJsonAssetsPlugin({
      assetNameRegExp: /assets\/.*\.json$/g,
      jsonProcessor: require('jsonminify'),
      canPrint: true
    }),
    /**
     * Plugin: CompressionPlugin
     * Description: Prepares compressed versions of assets to serve
     * them with Content-Encoding
     *
     * See: https://github.com/webpack/compression-webpack-plugin
     */
    //  install compression-webpack-plugin
    // new CompressionPlugin({
    //   regExp: /\.css$|\.html$|\.js$|\.map|\.json$/,
    //   threshold: 2 * 1024
    // }),

    new LoaderOptionsPlugin({
      minimize: true,
      debug: false,
      options: {

        /**
         * Html loader advanced options
         *
         * See: https://github.com/webpack/html-loader#advanced-options
         */
        // TODO: Need to workaround Angular 2's html syntax => #id [bind] (event) *ngFor
        htmlLoader: {
          minimize: true,
          removeAttributeQuotes: false,
          caseSensitive: true,
          customAttrSurround: [
            [/#/, /(?:)/],
            [/\*/, /(?:)/],
            [/\[?\(?/, /(?:)/]
          ],
          customAttrAssign: [/\)?\]?=/]
        },

        // Fix: Path must be a string. Received undefined (sass-loader)
        // https://github.com/jtangelder/sass-loader/issues/285
        // Fix: Cannot read property 'path' of undefined (resolve-url-loader)
        // https://github.com/bholloway/resolve-url-loader/issues/33
        sassLoader: {
          includePaths: [
            helpers.root('node_modules'),
            helpers.root('src')
          ]
        },

        context: helpers.root('src'),

        output: {
          path: helpers.root('dist')
        }
      }
    }),
  ],
  /**
   * Webpack Development Server configuration
   * Description: The webpack-dev-server is a little node.js Express server.
   * The server emits information about the compilation state to the client,
   * which reacts to those events.
   *
   * See: https://webpack.github.io/docs/webpack-dev-server.html
   */
  devServer: {
    port: METADATA.port,
    host: METADATA.host,
    historyApiFallback: true,
    watchOptions: {
      aggregateTimeout: 300,
      poll: 1000
      // Add a comment to this line
    }
  },
  /**
   * Static analysis linter for TypeScript advanced options configuration
   * Description: An extensible linter for the TypeScript language.
   *
   * See: https://github.com/wbuchwalter/tslint-loader
   */
  // tslint: {
  //   emitErrors: true,
  //   failOnHint: true,
  //   resourcePath: 'src'
  // },

  /*
   * Include polyfills or mocks for various node stuff
   * Description: Node configuration
   *
   * See: https://webpack.github.io/docs/configuration.html#node
   */
  node: {
    global: true,
    crypto: 'empty',
    process: false,
    module: false,
    clearImmediate: false,
    setImmediate: false
  }

});
