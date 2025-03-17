import { styleObject } from "@src/modules/render/md-converter/themes/types.ts";

export const makeStyleText = (styles?: styleObject) => {
  if (!styles) return "";
  const arr = [];
  for (const key in styles) {
    arr.push(key + ":" + styles[key]);
  }
  return arr.join(";");
};
