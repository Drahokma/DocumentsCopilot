import { DataStreamWriter, tool, streamObject } from 'ai';
import { z } from 'zod';
import { Session } from 'next-auth';
import { findRelevantContent } from '@/lib/ai/embeddings';
import { myProvider } from '../providers';

interface TemplateSection {
  title: string;
  level: number;
  requirements: string[];
  originalContent: string;
  parentSection?: string;
}

interface AnalyzeTemplateStructureProps {
  session: Session;
  dataStream: DataStreamWriter;
  chatId: string;
}

export const analyzeTemplateStructure = ({ session, dataStream, chatId }: AnalyzeTemplateStructureProps) =>
  tool({
    description: 'Analyze template document structure and extract requirements for each section',
    parameters: z.object({
      chatId: z.string().describe('The chat ID to find template file'),
    }),
    execute: async ({ chatId }) => {
      // Find template file content using existing findRelevantContent
      const templateContent = await findRelevantContent("", chatId);
      
      if (templateContent.length === 0) {
        return {
          success: false,
          message: "No template file found"
        };
      }

      // First, analyze the overall structure with GPT-3.5 Mini
      const { elementStream } = streamObject({
        model: myProvider.languageModel('chat-model-small'),
        system: 'Analyze the document structure and identify sections with their requirements. Each section should include title, level (heading depth), and any requirements found.',
        prompt: templateContent[0].content,
        schema: z.object({
          sections: z.array(z.object({
            title: z.string(),
            level: z.number(),
            requirements: z.array(z.string()),
            content: z.string()
          }))
        })
      });

      const sections: TemplateSection[] = [];
      
      for await (const element of elementStream) {
        for (const section of element.sections) {
          sections.push({
            title: section.title,
            level: section.level,
            requirements: section.requirements,
            originalContent: section.content
          });
        }
      }

      // Build section hierarchy
      const hierarchy = buildSectionHierarchy(sections);

      dataStream.writeData({
        type: 'template-analysis',
        content: JSON.stringify(hierarchy, null, 2)
      });

      return {
        success: true,
        sections: hierarchy,
        message: `Template analyzed with ${sections.length} sections`
      };
    },
  });

function buildSectionHierarchy(sections: TemplateSection[]) {
  const hierarchy: TemplateSection[] = [];
  const sectionStack: TemplateSection[] = [];
  
  for (const section of sections) {
    while (
      sectionStack.length > 0 && 
      sectionStack[sectionStack.length - 1].level >= section.level
    ) {
      sectionStack.pop();
    }
    
    if (sectionStack.length > 0) {
      section.parentSection = sectionStack[sectionStack.length - 1].title;
    }
    
    sectionStack.push(section);
    hierarchy.push(section);
  }
  
  return hierarchy;
} 