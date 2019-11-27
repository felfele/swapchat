module.exports = {
	entry: {
		index: './build/index.js',
	},
	output: {
		libraryTarget: 'window'
	},
	mode: 'production',
	performance: {
		hints: false
	},
	stats: 'errors-only',
};
