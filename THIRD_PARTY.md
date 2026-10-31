# Third-party notices

## DDNet / Teeworlds

`public/assets/ddnet-entities.png` is an unmodified copy of
`data/assets/entities/comfort/ddnet.png` from the clean local DDNet 20.1.1 distribution.
Attribution: **louis**, Comfort entities.
Source: https://github.com/ddnet/ddnet
Content license: Creative Commons Attribution-ShareAlike 3.0 Unported:
https://creativecommons.org/licenses/by-sa/3.0/
Original distribution notices: `public/licenses/DDNet.txt`.
Specific Comfort notice: `public/licenses/entities.txt`.
SHA-256: `4CBF66DF078A56FFAF245B658638A54F50B5DAB5681E6BD6D7272DFF42688E50`.

The BestClient website's observed `/mappreview/entities/comfort.png` has exactly
the same bytes and SHA-256. This project uses the official DDNet-distributed
resource under its stated license; it is not an approximation or a new texture.
The atlas remains 1024×1024 with the original 16×16 DDNet tile-index layout.

`public/assets/ddnet-speed-arrow.png` is the unmodified official DDNet
`data/editor/speed_arrow.png`, covered by the DDNet data CC BY-SA 3.0 notice.
Speedup is a separate layer, so native arrow geometry uses the raw angle/force/
max-speed fields, not the unrelated cell 28 of a general tile atlas.

No client source code has been copied into this website. The format, UV flags,
envelope semantics and projection behavior were studied to write the parser and
renderer. This is an independent, incomplete browser implementation, not DDNet.

## fflate

MIT License, Copyright (c) 2020 Arjun Barrett. Used to decompress zlib data blocks.
The original MIT license is redistributed in `public/licenses/fflate.txt`.
https://github.com/101arrowz/fflate

## User-provided map

`public/maps/for-site.map` is copied without modification from the user's
`For Site.map`. All 17 embedded images are loaded directly from that file.
The map does not specify author/credits/license metadata. This local prototype
does not establish redistribution permission for the map or its embedded art.

## BestClient reference

https://bestclient.fun/ was examined for route navigation behavior. No source,
map, graphics, logos, or other proprietary assets have been imported from it.
The legally shared Comfort entities atlas is sourced from the DDNet distribution,
as described above; no BestClient code was copied to implement this change.
