import { memo } from 'react';
import { CrossIcon } from './icons';
import { Button } from './ui/button';
import { initialArtifactData, useArtifact } from '@/hooks/use-artifact';

function PureArtifactCloseButton() {
  const { artifact, setArtifact } = useArtifact();

  return (
    <Button
      variant="outline"
      className="h-fit p-2 dark:hover:bg-zinc-700"
      onClick={() => {
        setArtifact((currentArtifact) =>
          currentArtifact.status === 'streaming'
            ? {
                ...currentArtifact,
                isVisible: false,
              }
            : { 
                ...currentArtifact,
                isVisible: false,
                // Keep the document data for reopening
                // don't reset to initialArtifactData
              },
        );
      }}
    >
      <CrossIcon size={18} />
    </Button>
  );
}

export default memo(PureArtifactCloseButton);
export { PureArtifactCloseButton as ArtifactCloseButton };
