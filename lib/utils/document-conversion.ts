import mammoth from 'mammoth';

interface ConversionResult {
  markdown: string;
  messages: string[];
}

export async function convertWordToMarkdown(file: File): Promise<ConversionResult> {
  // Read the file as ArrayBuffer
  const buffer = await file.arrayBuffer();
  
  // Convert Word to HTML first
  const { value: html, messages } = await mammoth.convertToHtml({ arrayBuffer: buffer }, {
    styleMap: [
      "p[style-name='Heading 1'] => h1",
      "p[style-name='Heading 2'] => h2",
      "p[style-name='Heading 3'] => h3",
      "p[style-name='Heading 4'] => h4",
      "p[style-name='Heading 5'] => h5",
      "p[style-name='Heading 6'] => h6",
    ]
  });

  // Basic HTML to Markdown conversion with image handling
  const markdown = html
    // Handle images - replace base64 with placeholder
    .replace(/<img[^>]*src="data:image\/[^"]*base64,[^"]*"[^>]*>/g, '![Image][Embedded image]')
    // Headers
    .replace(/<h([1-6])>([^<]*)<\/h[1-6]>/g, (_, level, text) => 
      `${'#'.repeat(parseInt(level))} ${text.trim()}\n\n`)
    // Bold
    .replace(/<strong>([^<]*)<\/strong>/g, '**$1**')
    // Italic
    .replace(/<em>([^<]*)<\/em>/g, '*$1*')
    // Lists
    .replace(/<ul>\s*([^<]*)<\/ul>/g, (_, items) => 
      items.replace(/<li>([^<]*)<\/li>/g, '- $1\n'))
    .replace(/<ol>\s*([^<]*)<\/ol>/g, (_, items) => {
      let counter = 1;
      return items.replace(/<li>([^<]*)<\/li>/g, () => `${counter++}. $1\n`);
    })
    // Paragraphs
    .replace(/<p>([^<]*)<\/p>/g, '$1\n\n')
    // Clean up extra whitespace
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  console.log('markdown', markdown);
  return {
    markdown,
    messages: messages.map(msg => msg.message)
  };
} 