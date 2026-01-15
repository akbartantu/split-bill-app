import { useBillStore } from '@/store/billStore';
import { motion } from 'framer-motion';
import { Receipt, ChevronRight, Users, ListPlus, PieChart } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CurrencySelector } from '@/components/settings/CurrencySelector';

const steps = [
  { key: 'participants', label: 'People', icon: Users },
  { key: 'items', label: 'Items', icon: ListPlus },
  { key: 'summary', label: 'Split', icon: PieChart },
] as const;

export function StepIndicator() {
  const { step, setStep, currentBill } = useBillStore();
  
  const currentIndex = steps.findIndex(s => s.key === step);
  
  const canNavigateTo = (stepKey: typeof steps[number]['key']) => {
    const targetIndex = steps.findIndex(s => s.key === stepKey);
    
    // Can always go back
    if (targetIndex < currentIndex) return true;
    
    // Need participants to proceed
    if (stepKey !== 'participants' && currentBill.participants.length < 2) return false;
    
    // Can go to next step
    if (targetIndex <= currentIndex + 1) return true;
    
    return false;
  };

  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {steps.map((s, index) => {
        const Icon = s.icon;
        const isActive = step === s.key;
        const isPast = currentIndex > index;
        const canClick = canNavigateTo(s.key);

        return (
          <div key={s.key} className="flex items-center">
            <motion.button
              onClick={() => canClick && setStep(s.key)}
              disabled={!canClick}
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all',
                isActive && 'bg-primary text-primary-foreground shadow-md',
                isPast && !isActive && 'bg-primary/10 text-primary',
                !isActive && !isPast && 'text-muted-foreground',
                canClick && !isActive && 'hover:bg-secondary cursor-pointer',
                !canClick && 'opacity-50 cursor-not-allowed'
              )}
              whileHover={canClick ? { scale: 1.02 } : {}}
              whileTap={canClick ? { scale: 0.98 } : {}}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{s.label}</span>
            </motion.button>
            
            {index < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-muted-foreground/50 mx-1" />
            )}
          </div>
        );
      })}
    </div>
  );
}

export function Header() {
  const { currentBill, resetBill } = useBillStore();

  return (
    <header className="sticky top-0 z-50 glass border-b border-border/50">
      <div className="container max-w-2xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl gradient-primary flex items-center justify-center shadow-md">
              <Receipt className="w-5 h-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="font-display font-bold text-lg leading-tight">BillSplit</h1>
              <p className="text-xs text-muted-foreground">Split fairly, stay friends</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <CurrencySelector />
            <motion.button
              onClick={resetBill}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              New Bill
            </motion.button>
          </div>
        </div>
        
        <StepIndicator />
      </div>
    </header>
  );
}
