export default {
  "**/*.{ts,tsx,js,mjs,cjs}": ["oxlint --fix", "oxfmt"],
  // typecheck must run on the whole project — ignore the staged file list
  "**/*.ts?(x)": () => "tsc --noEmit",
};
