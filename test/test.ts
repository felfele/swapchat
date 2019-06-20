import { uploadToFeed } from '../src/index';
uploadToFeed('', Buffer.from([1,2,3])).then(function(hash) {
	console.log(hash);
});
