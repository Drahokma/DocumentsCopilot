import { NextRequest, NextResponse } from 'next/server';
import { getDocumentById } from '@/lib/db/queries';
import { auth } from '@/app/(auth)/auth';
import { marked } from 'marked';
import puppeteer from 'puppeteer';
import { Document as DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, BorderStyle } from 'docx';

export async function POST(request: NextRequest) {
  const session = await auth();
  
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { id, format } = await request.json();
  
  if (!id || !format) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  
  const document = await getDocumentById({ id });
  
  if (!document) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }
  
  try {
    if (format === 'pdf') {
      // Generate PDF using Puppeteer with proper styling
      const html = marked.parse(document.content || '');
      const styledHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>${document.title}</title>
            <style>
              body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                line-height: 1.6;
                margin: 40px;
                color: #333;
                font-size: 12pt;
              }
              h1, h2, h3, h4, h5, h6 {
                margin-top: 24px;
                margin-bottom: 16px;
                font-weight: 600;
                line-height: 1.25;
                color: #000;
              }
              h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
              h3 { font-size: 1.25em; }
              h4 { font-size: 1em; }
              h5 { font-size: 0.875em; }
              h6 { font-size: 0.85em; }
              p, ul, ol { margin-bottom: 16px; }
              ul, ol { padding-left: 2em; }
              li { margin-bottom: 0.25em; }
              a { color: #0366d6; text-decoration: none; }
              code {
                font-family: 'Courier New', Courier, monospace;
                background-color: #f6f8fa;
                padding: 0.2em 0.4em;
                border-radius: 3px;
                font-size: 0.9em;
              }
              pre {
                background-color: #f6f8fa;
                border-radius: 3px;
                padding: 16px;
                overflow: auto;
                font-family: 'Courier New', Courier, monospace;
                font-size: 0.9em;
                line-height: 1.45;
              }
              table {
                border-collapse: collapse;
                width: 100%;
                margin-bottom: 16px;
              }
              table, th, td {
                border: 1px solid #dfe2e5;
              }
              th, td {
                padding: 8px 16px;
                text-align: left;
              }
              th {
                background-color: #f6f8fa;
                font-weight: 600;
              }
              blockquote {
                margin: 0;
                padding: 0 1em;
                color: #6a737d;
                border-left: 0.25em solid #dfe2e5;
              }
              hr {
                height: 0.25em;
                padding: 0;
                margin: 24px 0;
                background-color: #e1e4e8;
                border: 0;
              }
              img {
                max-width: 100%;
                height: auto;
              }
            </style>
          </head>
          <body>
            ${html}
          </body>
        </html>
      `;
      
      // Launch Puppeteer with more explicit options
      const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      
      // Set content with proper wait until options
      await page.setContent(styledHtml, {
        waitUntil: 'networkidle0'
      });
      
      // Generate PDF with better options
      const pdf = await page.pdf({ 
        format: 'A4',
        printBackground: true,
        margin: {
          top: '40px',
          right: '40px',
          bottom: '40px',
          left: '40px'
        },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate: `
          <div style="width: 100%; font-size: 8px; padding: 0 20px; text-align: center; color: #777;">
            Page <span class="pageNumber"></span> of <span class="totalPages"></span>
          </div>
        `,
      });
      
      await browser.close();
      
      // Return the PDF with proper headers
      return new NextResponse(pdf, {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${document.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.pdf"`,
          'Content-Length': pdf.length.toString()
        },
      });
    } else if (format === 'docx') {
      // Parse markdown content
      const tokens = marked.lexer(document.content || '');
      
      // Create document sections
      const children = [];
      
      // Helper function to process text with formatting
      const processFormattedText = (text: string) => {
        // Handle bold text with ** or __
        const boldRegex = /(\*\*|__)(.*?)\1/g;
        // Handle italic text with * or _
        const italicRegex = /(\*|_)(.*?)\1/g;
        // Handle code with `
        const codeRegex = /`([^`]+)`/g;
        
        let formattedText = text;
        let textRuns = [];
        
        // Find all formatting markers
        const markers = [];
        let match;
        
        // Find bold markers
        while ((match = boldRegex.exec(text)) !== null) {
          markers.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[2],
            format: 'bold'
          });
        }
        
        // Find italic markers
        while ((match = italicRegex.exec(text)) !== null) {
          markers.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[2],
            format: 'italic'
          });
        }
        
        // Find code markers
        while ((match = codeRegex.exec(text)) !== null) {
          markers.push({
            start: match.index,
            end: match.index + match[0].length,
            text: match[1],
            format: 'code'
          });
        }
        
        // Sort markers by start position
        markers.sort((a, b) => a.start - b.start);
        
        // If no formatting, return simple text run
        if (markers.length === 0) {
          return [new TextRun(text)];
        }
        
        // Process text with formatting
        let lastIndex = 0;
        
        for (const marker of markers) {
          // Add text before the marker
          if (marker.start > lastIndex) {
            textRuns.push(new TextRun(text.substring(lastIndex, marker.start)));
          }
          
          // Add formatted text
          if (marker.format === 'bold') {
            textRuns.push(new TextRun({ text: marker.text, bold: true }));
          } else if (marker.format === 'italic') {
            textRuns.push(new TextRun({ text: marker.text, italics: true }));
          } else if (marker.format === 'code') {
            textRuns.push(new TextRun({ 
              text: marker.text, 
              font: 'Courier New',
              size: 20
            }));
          }
          
          lastIndex = marker.end;
        }
        
        // Add any remaining text
        if (lastIndex < text.length) {
          textRuns.push(new TextRun(text.substring(lastIndex)));
        }
        
        return textRuns;
      };
      
      // Track list state
      let inList = false;
      let listItems = [];
      let listType = null;
      
      // Process markdown tokens and convert to docx elements
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        
        if (token.type === 'heading') {
          // Flush any pending list
          if (inList) {
            children.push(...listItems);
            listItems = [];
            inList = false;
          }
          
          // Map heading levels with proper type safety
          const headingLevel = token.depth >= 1 && token.depth <= 6 
            ? [
                HeadingLevel.HEADING_1,
                HeadingLevel.HEADING_2,
                HeadingLevel.HEADING_3,
                HeadingLevel.HEADING_4,
                HeadingLevel.HEADING_5,
                HeadingLevel.HEADING_6,
              ][token.depth - 1] 
            : HeadingLevel.HEADING_1;
          
          children.push(
            new Paragraph({
              children: processFormattedText(token.text),
              heading: headingLevel,
              spacing: { after: 200 }
            })
          );
        } else if (token.type === 'paragraph') {
          // Flush any pending list
          if (inList) {
            children.push(...listItems);
            listItems = [];
            inList = false;
          }
          
          children.push(
            new Paragraph({
              children: processFormattedText(token.text),
              spacing: { after: 200 }
            })
          );
        } else if (token.type === 'list_start') {
          inList = true;
          listType = token.ordered ? 'ordered' : 'unordered';
        } else if (token.type === 'list_end') {
          // Add all list items
          children.push(...listItems);
          listItems = [];
          inList = false;
        } else if (token.type === 'list_item_start') {
          // Process list item - need to look ahead to get the text
          let itemText = '';
          let j = i + 1;
          while (j < tokens.length && tokens[j].type !== 'list_item_end') {
            if (tokens[j].type === 'text' || tokens[j].type === 'paragraph') {
              itemText += tokens[j].text;
            }
            j++;
          }
          
          listItems.push(
            new Paragraph({
              children: processFormattedText(itemText),
              bullet: listType === 'unordered' ? { level: 0 } : undefined,
              numbering: listType === 'ordered' ? { reference: 'default-numbering', level: 0 } : undefined,
              spacing: { after: 100 }
            })
          );
        } else if (token.type === 'code') {
          // Flush any pending list
          if (inList) {
            children.push(...listItems);
            listItems = [];
            inList = false;
          }
          
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: token.text,
                  font: 'Courier New',
                  size: 20
                })
              ],
              spacing: { after: 200, before: 200 },
              border: {
                top: { style: BorderStyle.SINGLE, size: 1, color: 'auto' },
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'auto' },
                left: { style: BorderStyle.SINGLE, size: 1, color: 'auto' },
                right: { style: BorderStyle.SINGLE, size: 1, color: 'auto' }
              },
              shading: { type: 'solid', color: 'F0F0F0' }
            })
          );
        } else if (token.type === 'hr') {
          // Flush any pending list
          if (inList) {
            children.push(...listItems);
            listItems = [];
            inList = false;
          }
          
          children.push(
            new Paragraph({
              children: [],
              border: {
                bottom: { style: BorderStyle.SINGLE, size: 1, color: 'auto' }
              },
              spacing: { after: 200, before: 200 }
            })
          );
        } else if (token.type === 'blockquote_start') {
          // Process blockquote - need to look ahead to get the text
          let quoteText = '';
          let j = i + 1;
          while (j < tokens.length && tokens[j].type !== 'blockquote_end') {
            if (tokens[j].type === 'text' || tokens[j].type === 'paragraph') {
              quoteText += tokens[j].text + '\n';
            }
            j++;
          }
          
          children.push(
            new Paragraph({
              children: processFormattedText(quoteText.trim()),
              spacing: { after: 200, before: 200 },
              border: {
                left: { style: BorderStyle.SINGLE, size: 3, color: 'CCCCCC' }
              },
              indent: { left: 720 } // 0.5 inch indent
            })
          );
        }
      }
      
      // If no content was processed, add a default paragraph
      if (children.length === 0) {
        children.push(
          new Paragraph({
            children: [new TextRun(document.content || '')]
          })
        );
      }
      
      // Create the document with all processed elements
      const doc = new DocxDocument({
        styles: {
          paragraphStyles: [
            {
              id: HeadingLevel.HEADING_1,
              name: "Heading 1",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              run: {
                size: 32,
                bold: true,
                color: "000000"
              },
              paragraph: {
                spacing: { after: 240, before: 240 }
              }
            },
            {
              id: HeadingLevel.HEADING_2,
              name: "Heading 2",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              run: {
                size: 28,
                bold: true,
                color: "000000"
              },
              paragraph: {
                spacing: { after: 240, before: 240 }
              }
            },
            {
              id: HeadingLevel.HEADING_3,
              name: "Heading 3",
              basedOn: "Normal",
              next: "Normal",
              quickFormat: true,
              run: {
                size: 26,
                bold: true,
                color: "000000"
              },
              paragraph: {
                spacing: { after: 240, before: 240 }
              }
            }
          ]
        },
        numbering: {
          config: [
            {
              reference: "default-numbering",
              levels: [
                {
                  level: 0,
                  format: "decimal",
                  text: "%1.",
                  alignment: "start",
                  style: {
                    paragraph: {
                      indent: { left: 720, hanging: 360 }
                    }
                  }
                }
              ]
            }
          ]
        },
        sections: [{
          properties: {},
          children: children
        }]
      });
      
      const buffer = await Packer.toBuffer(doc);
      
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename="${document.title.replace(/[^a-zA-Z0-9-_]/g, '_')}.docx"`,
        },
      });
    }
    
    return NextResponse.json({ error: 'Unsupported format' }, { status: 400 });
  } catch (error) {
    console.error('Error exporting document:', error);
    return NextResponse.json({ error: 'Failed to export document' }, { status: 500 });
  }
} 