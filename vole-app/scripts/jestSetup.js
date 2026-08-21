// jsdom does not expose TextEncoder/TextDecoder as globals, but zarrita needs them to
// decode vlen-utf8 string arrays — and so do the fixtures that build such arrays. Node
// has had both since v11; this only makes them visible inside the jsdom environment.
const { TextEncoder, TextDecoder } = require("util");

if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  global.TextDecoder = TextDecoder;
}
