const { src, dest, task, series } = require('gulp');

const posthtml = require('gulp-posthtml');
const posthtmlInlineAssets = require('posthtml-inline-assets');

const inlineFonts = require('gulp-inline-fonts');

exports.default = function() {
  return src('dist/*.html')
  .pipe(
  posthtml([
    posthtmlInlineAssets({
    	cwd: 'dist'
    })
  ])
  ).pipe(dest('dist-html-only/'));
}

let inline_fonts = function() {
return src(['dist/fonts/*.woff'])
  .pipe(inlineFonts({ name: 'DOS' }))
  .pipe(dest('dist/'));
};

let inline_js_css = function() {
  return src('dist/*.html')
  .pipe(
  posthtml([
    posthtmlInlineAssets({
    	cwd: 'dist'
    })
  ])
  ).pipe(dest('dist-html-only/'));
};

// exports.inline_js_css = inline_js_css;
exports.default = series(
  inline_fonts,
  inline_js_css
);

// exports.default = function() {
//   return src('dist/*.html')
//   .pipe(
//   posthtml([
//     posthtmlInlineAssets({
//     	cwd: '/Users/sig/Code/swarm2/swapchat/dist'
//     })
//   ])
//   ).pipe(dest('output2/'));
// }

// .pipe(inlineFonts({ name: 'icons' }))

// exports.default =
