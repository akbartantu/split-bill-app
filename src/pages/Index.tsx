import { useBillStore } from '@/store/billStore';
import { Header } from '@/components/Header';
import { ParticipantsStep } from '@/components/steps/ParticipantsStep';
import { ItemsStep } from '@/components/steps/ItemsStep';
import { SummaryStep } from '@/components/steps/SummaryStep';
import { AnimatePresence, motion } from 'framer-motion';

const Index = () => {
  const { step } = useBillStore();

  const renderStep = () => {
    switch (step) {
      case 'participants':
        return <ParticipantsStep key="participants" />;
      case 'items':
        return <ItemsStep key="items" />;
      case 'adjustments':
        return <ItemsStep key="items" />;
      case 'summary':
        return <SummaryStep key="summary" />;
      default:
        return <ParticipantsStep key="participants" />;
    }
  };

  return (
    <div className="min-h-screen gradient-hero">
      <Header />
      
      <main className="container max-w-2xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {renderStep()}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-6 text-center text-sm text-muted-foreground">
        <p>BillSplit Pro • Split fairly, stay friends</p>
      </footer>
    </div>
  );
};

export default Index;
