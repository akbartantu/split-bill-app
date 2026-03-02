import { motion } from 'framer-motion';
import { Pencil, X, Check } from 'lucide-react';
import type { BillItem, Participant } from '@/types/bill';
import { formatCurrency } from '@/lib/calculations';
import { cn } from '@/lib/utils';

interface ItemRowProps {
  item: BillItem;
  participants: Participant[];
  currencyCode: string;
  onToggleAssignment: (itemId: string, participantId: string) => void;
  onEdit: (item: BillItem) => void;
  onRemove: (itemId: string) => void;
}

export function ItemRow({
  item,
  participants,
  currencyCode,
  onToggleAssignment,
  onEdit,
  onRemove,
}: ItemRowProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.2 } }}
      className="bg-card rounded-xl p-4 shadow-card space-y-3"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium break-words">{item.name}</p>
          <p className="text-sm text-muted-foreground">
            {item.quantity > 1 && `${item.quantity} × `}
            {formatCurrency(item.unitPriceMinor, currencyCode)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono-nums font-semibold text-primary">
            {formatCurrency(item.lineTotalMinor, currencyCode)}
          </span>
          <motion.button
            onClick={() => onEdit(item)}
            className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Edit item"
          >
            <Pencil className="w-4 h-4" />
          </motion.button>
          <motion.button
            onClick={() => onRemove(item.id)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title="Remove item"
          >
            <X className="w-4 h-4" />
          </motion.button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {participants.map((p) => {
          const isAssigned = item.assignees.some(a => a.participantId === p.id);
          return (
            <motion.button
              key={p.id}
              onClick={() => onToggleAssignment(item.id, p.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all',
                isAssigned
                  ? 'text-white shadow-sm'
                  : 'bg-secondary text-muted-foreground hover:bg-secondary/80'
              )}
              style={isAssigned ? { backgroundColor: p.color } : {}}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              {isAssigned && <Check className="w-3.5 h-3.5" />}
              {p.name}
            </motion.button>
          );
        })}
      </div>

      {item.assignees.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Tap names to assign • Unassigned items split equally
        </p>
      )}
    </motion.div>
  );
}
