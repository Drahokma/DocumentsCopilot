import * as PDFJS from 'pdfjs-dist';
import mammoth from 'mammoth';
export const isWordDocument = (file: File) => {
  const wordTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/msword' // .doc
  ];
  return wordTypes.includes(file.type);
};

export const getFileExtension = (filename: string) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
};

export const convertToMarkdownFilename = (filename: string) => {
  const extension = getFileExtension(filename);
  if (['doc', 'docx'].includes(extension)) {
    return filename.replace(/\.(doc|docx)$/, '.md');
  }
  return filename;
}; 

export const getFileContent = async (file: File) => {
    // Handle PDF files
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFJS.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(1);
      const textContent = await page.getTextContent();
      return textContent.items
        .map((item) => {
          if ('str' in item) {
            return (item as { str: string }).str;
          }
          return '';
        })
        .join(' ');
    }
    
    // Handle Word documents
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
        file.type === 'application/msword') {
      const arrayBuffer = await file.arrayBuffer();
      const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
      
      // Basic HTML to text conversion
      const text = html
        // Remove HTML tags
        .replace(/<[^>]*>/g, ' ')
        // Replace multiple spaces with single space
        .replace(/\s+/g, ' ')
        // Trim leading/trailing spaces
        .trim();
        
      return text;
    }
    
    // Handle other text-based files
    return await file.text();
  };