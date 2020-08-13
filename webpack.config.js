module.exports = {
	entry: {
		index: './build/index.js',
	},
	output: {
		libraryTarget: 'window'
	},
	mode: 'development',
	performance: {
		hints: false
	},
	stats: 'errors-only',
};
