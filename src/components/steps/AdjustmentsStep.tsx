import { useBillStore } from '@/store/billStore';
import { motion } from 'framer-motion';
import { Settings2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function AdjustmentsStep() {
  const { nextStep, prevStep, setStep } = useBillStore();

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-2">
          <Settings2 className="w-8 h-8 text-primary" />
        </div>
        <h2 className="font-display text-2xl font-bold">Extra charges</h2>
        <p className="text-muted-foreground">Extras are managed per receipt</p>
      </div>

      <div className="bg-card rounded-xl p-4 shadow-card space-y-2">
        <p className="text-sm text-muted-foreground">
          Tax, service charge, and tip are now inside each receipt card on the Items tab.
        </p>
        <Button variant="outline" onClick={() => setStep('items')}>
          Go to Items
        </Button>
      </div>

      <div className="flex gap-3 pt-4">
        <Button
          onClick={prevStep}
          variant="outline"
          className="flex-1 h-12"
          size="lg"
        >
          <ArrowLeft className="w-5 h-5 mr-2" />
          Back
        </Button>
        <Button
          onClick={nextStep}
          className="flex-1 h-12 font-semibold"
          size="lg"
        >
          View Split
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}
