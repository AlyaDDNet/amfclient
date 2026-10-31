/** Verified stable Windows x64 Portable release asset, kept outside the editable panel content. */
export const AMF_DOWNLOAD = Object.freeze({
	version: '2.0.1',
	assetName: 'AMFClient-2.0.1-Nova-Portable.zip',
	url: 'https://github.com/AlyaDDNet/AMF-Client/releases/download/v2.0.1/AMFClient-2.0.1-Nova-Portable.zip',
	releaseUrl: 'https://github.com/AlyaDDNet/AMF-Client/releases/tag/v2.0.1',
});

export function downloadHref(): string { return AMF_DOWNLOAD.url; }
