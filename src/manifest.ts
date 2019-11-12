import { FEEDMIME, SCRIPTFEEDTOPIC, HTMLFEEDTOPIC, AUTHORUSER } from './settings.js';

// creates a date string in format 0000-00-00T00:00:00+00:00
export function createManifestDate(timestamp?:number):string {
	if (timestamp === undefined) {
		timestamp = Date.now();
	}
	const ourDate = new Date(timestamp);

	// strip the time zone part, because we need a different represenation
	let dateString = ourDate.toISOString().substring(0, "0000-00-00T00:00:00".length);
	const timeZone = ourDate.getTimezoneOffset();
	if (timeZone < 0) {
		dateString += '+';
	} else {
		dateString += '-';
	}
	const tzHours = Math.abs(Math.floor(ourDate.getTimezoneOffset() / 60));
	const hoursString = tzHours.toString();
	if (hoursString.length == 1) {
		dateString += "0";
	}
	dateString += hoursString + ":";
	const tzMinutes = ourDate.getTimezoneOffset() % 60;
	const minutesString = tzMinutes.toString();
	if (minutesString.length == 1) {
		dateString += "0";
	}
	dateString += minutesString;
	return dateString;
}

// varHash is the hash of the HEADER SCRIPT section above
// size is the byte size of the contents of the header script
export function createManifest(varHash:string, size:number):string {
	const dateString = createManifestDate();
	const dateStringZero = "0001-01-01T00:00:00Z";
	let o = {entries: [
		{
			hash: varHash,
			path: "head.js",
			contentType: 'application/json',
			mode: 420,
			size: size,
			mod_time: dateString,	
		},
		{
			path: "main.js",
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + SCRIPTFEEDTOPIC,
			}
		},
		{
			path: "index.html",
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + HTMLFEEDTOPIC,
			}
		},
		{
			contentType: FEEDMIME,
			mod_time: dateStringZero,
			feed: {
				user: "0x" + AUTHORUSER,
				topic: "0x" + HTMLFEEDTOPIC,
			}
		}
	]};
	return JSON.stringify(o);	
}

