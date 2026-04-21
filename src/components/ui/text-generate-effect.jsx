import { motion } from 'motion/react';
import { cn } from '../../lib/utils.js';

export function TextGenerateEffect({ words, className }) {
  const segments = String(words)
    .split(' ')
    .filter(Boolean);

  return (
    <div className={cn('flex flex-wrap gap-x-2 gap-y-3', className)}>
      {segments.map((word, index) => (
        <motion.span
          key={`${word}-${index}`}
          initial={{ opacity: 0, filter: 'blur(10px)', y: 10 }}
          animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.45, ease: 'easeOut' }}
          className="inline-block"
        >
          {word}
        </motion.span>
      ))}
    </div>
  );
}
