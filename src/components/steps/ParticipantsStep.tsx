import { useState } from 'react';
import { useBillStore } from '@/store/billStore';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Users, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
};

export function ParticipantsStep() {
  const { currentBill, addParticipant, removeParticipant, nextStep } = useBillStore();
  const [newName, setNewName] = useState('');

  const handleAdd = () => {
    if (newName.trim()) {
      addParticipant(newName.trim());
      setNewName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAdd();
    }
  };

  const canProceed = currentBill.participants.length >= 2;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
          <Users className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">Who's splitting?</h2>
        <p className="text-muted-foreground">Add at least 2 people to split the bill</p>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Enter name..."
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={handleKeyDown}
          className="flex-1"
          autoFocus
        />
        <Button 
          onClick={handleAdd} 
          disabled={!newName.trim()}
          size="icon"
          className="shrink-0"
        >
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="space-y-2"
      >
        <AnimatePresence mode="popLayout">
          {currentBill.participants.map((participant) => (
            <motion.div
              key={participant.id}
              variants={item}
              layout
              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
              className="flex items-center gap-3 p-4 bg-card rounded-xl shadow-card"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-lg"
                style={{ backgroundColor: participant.color }}
              >
                {participant.name.charAt(0).toUpperCase()}
              </div>
              <span className="flex-1 font-medium">{participant.name}</span>
              <motion.button
                onClick={() => removeParticipant(participant.id)}
                className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <X className="w-4 h-4" />
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>

      {currentBill.participants.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No one here yet. Add some names above!</p>
        </div>
      )}

      <div className="pt-4">
        <Button
          onClick={nextStep}
          disabled={!canProceed}
          className="w-full h-12 text-base font-semibold"
          size="lg"
        >
          Continue to Items
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
        {!canProceed && currentBill.participants.length > 0 && (
          <p className="text-center text-sm text-muted-foreground mt-2">
            Add at least one more person
          </p>
        )}
      </div>
    </motion.div>
  );
}
