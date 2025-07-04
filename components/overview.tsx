import { motion } from 'framer-motion';
import Link from 'next/link';

import { MessageIcon, VercelIcon } from './icons';

export const Overview = () => {
  return (
    <motion.div
      key="overview"
      className="max-w-3xl mx-auto md:mt-20"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ delay: 0.5 }}
    >
      <div className="rounded-xl p-6 flex flex-col gap-8 leading-relaxed text-center max-w-xl">
        <p className="flex flex-row justify-center gap-4 items-center">
          <VercelIcon size={32} />
          <span>+</span>
          <MessageIcon size={32} />
        </p>
        <p>
          Welcome to EmbedIT Document Copilot, an intelligent document generation system. 
          Upload a template document and source files, and the copilot will automatically 
          generate a complete document by embedding relevant information from your source 
          files into the template structure.
        </p>
        <p>
          To get started, use the file selection panel on the right to upload your template 
          document and source files. The template should contain placeholders that the copilot 
          will replace with relevant content from your source files.
        </p>
        <p>
          The document copilot analyzes your template's structure and placeholders, then 
          intelligently fills them with the most relevant information from your source files, 
          creating a professionally formatted document in seconds.
        </p>
      </div>
    </motion.div>
  );
};
