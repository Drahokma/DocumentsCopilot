import { saveAs } from 'file-saver';
import { Document } from '@/lib/db/schema';


export async function exportToPdf(document: Document) {
  try {
    const response = await fetch('/api/document/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: document.id,
        format: 'pdf',
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to export document');
    }
    
    const blob = await response.blob();
    saveAs(blob, `${document.title}.pdf`);
    
    return true;
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    return false;
  }
}

export async function exportToDocx(document: Document) {
  try {
    const response = await fetch('/api/document/export', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: document.id,
        format: 'docx',
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to export document');
    }
    
    const blob = await response.blob();
    saveAs(blob, `${document.title}.docx`);
    
    return true;
  } catch (error) {
    console.error('Error exporting to DOCX:', error);
    return false;
  }
}
