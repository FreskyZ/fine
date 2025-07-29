# Markdown Libraries

ATTENTION this document is WORK IN PROGRESS

Some of the apps use markdown and render markdown in react.

First, search on npm

- https://www.npmjs.com/search?page=0&q=keywords%3Amarkdown&sortBy=dependent_count
- https://www.npmjs.com/search?page=0&q=keywords%3Amarkdown&sortBy=downloads_monthly

And collect results by human,

- marked https://www.npmjs.com/package/marked 35.1k
- markdown-it https://www.npmjs.com/package/markdown-it 20k
- remark-parse https://www.npmjs.com/package/remark 8.3k
  - and remark-rehype https://www.npmjs.com/package/remark-rehype
  - as part of https://unifiedjs.com/
  - also a lot of `mdast*` packages
  - also react-markdown https://www.npmjs.com/package/react-markdown which depends on remark-parse
- showdown https://www.npmjs.com/package/showdown 14.7k
- remarkable https://www.npmjs.com/package/remarkable 5.8k

Confirm requirements,

- render in react, react-markdown is popular but it's actually very small, so I'd like to render on my own
- tables
- latex formula, or else I barely can read latex formula
- additional custom element like `<clipboard/>` in my note application

Initial filter without investigation,

- marked is part of unifiedjs, unifiedjs is a very confusing library focus on abstract features,
  although it does not look like controled by big company to do stranger things, I'd like to rule it out here.

Extensibility features,

- https://marked.js.org/using_pro
- https://github.com/markdown-it/markdown-it/blob/master/docs/architecture.md
- https://github.com/showdownjs/showdown/wiki/extensions
- https://github.com/jonschlinkert/remarkable/blob/master/docs/plugins.md

Commonmark spec, amazingly marked does not fully support this, showdown is an old library and does not claim support this

https://github.com/commonmark/commonmark-spec/


{/* TODO https://github.com/remarkjs/react-markdown, NOTE react-markdown don't support ai's latex syntax, need something like const preprocessLaTeX = (content: string) => {
// Replace block-level LaTeX delimiters \[ \] with $$ $$  
const blockProcessedContent = content.replace(
    /\\\[(.*?)\\\]/gs,
    (_, equation) => `$$${equation}$$`,
);
// Replace inline LaTeX delimiters \( \) with $ $
const inlineProcessedContent = blockProcessedContent.replace(
    /\\\((.*?)\\\)/gs,
    (_, equation) => `$${equation}$`,
);
return inlineProcessedContent;
}; also see https://github.com/remarkjs/react-markdown/issues/785 */}
