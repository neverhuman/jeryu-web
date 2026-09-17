import { gfmFromMarkdown } from 'mdast-util-gfm';
import { gfm } from 'micromark-extension-gfm';
import type {} from 'remark-parse';
import type { Plugin } from 'unified';

// ReactMarkdown only reads Markdown. Register the same GFM parser extensions
// as remark-gfm without including its unused Markdown serialization code.
export const remarkGfmRead: Plugin = function () {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(gfm());
  (data.fromMarkdownExtensions ??= []).push(gfmFromMarkdown());
};
