import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Links in AI answers open in a new tab. Raw HTML is never rendered
// (react-markdown ignores it without rehype-raw).
const components = {
  a: ({ href, title, children }) => (
    <a href={href} title={title} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
};

const plugins = [remarkGfm];

function Markdown({ children }) {
  return (
    <div className="prose">
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

export default Markdown;
