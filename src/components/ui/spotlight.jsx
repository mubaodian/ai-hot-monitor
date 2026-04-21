import { motion } from 'motion/react';
import { cn } from '../../lib/utils.js';

export function Spotlight({ className, fill = 'white' }) {
  return (
    <motion.div
      initial={{ opacity: 0.35, scale: 0.92 }}
      animate={{ opacity: 0.65, scale: 1 }}
      transition={{ duration: 1.6, ease: 'easeOut' }}
      className={cn(
        'pointer-events-none absolute rounded-full blur-3xl',
        'bg-[radial-gradient(circle_at_center,rgba(79,241,194,0.32),rgba(79,241,194,0.06)_42%,transparent_72%)]',
        className
      )}
      style={{ boxShadow: `0 0 120px ${fill}` }}
      aria-hidden="true"
    />
  );
}
