// Markdown files are bundled as plain text by esbuild (--loader:.md=text).
declare module "*.md" {
  const content: string;
  export default content;
}
