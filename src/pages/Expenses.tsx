import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBillStore } from '@/store/billStore';
import { getExpenseSummary } from '@/selectors/expenses';
import { exportExpensesToCsv, downloadBlob } from '@/lib/export';
import { formatMoneyMinor } from '@/lib/currency';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Download, TrendingUp, Users, Calendar } from 'lucide-react';

export default function Expenses() {
  const { currentBill, recentBills } = useBillStore();
  const bills = useMemo(() => [currentBill, ...recentBills], [currentBill, recentBills]);
  const summary = useMemo(() => getExpenseSummary(bills), [bills]);
  const currencyCode = currentBill.currencyCode || currentBill.currency || 'USD';

  const handleExportCsv = () => {
    const csv = exportExpensesToCsv(summary, currencyCode);
    const filename = `expenses-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadBlob(csv, filename);
  };

  return (
    <div className="min-h-screen gradient-hero">
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="container max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to Split
            </Link>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={summary.receiptCount === 0}>
              <Download className="w-4 h-4 mr-2" /> Export CSV
            </Button>
          </div>
        </div>
      </header>

      <main className="container max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Expense tracking</h1>
          <p className="text-muted-foreground text-sm">Spending across current and recent bills</p>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-2xl font-bold">{formatMoneyMinor(summary.totalSpentMinor, currencyCode)}</p>
            <p className="text-sm text-muted-foreground">{summary.receiptCount} receipt{summary.receiptCount !== 1 ? 's' : ''}</p>
          </CardContent>
        </Card>

        {summary.receiptCount === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <p>No receipts or payments yet.</p>
              <p className="text-sm mt-1">Add receipts and payments in the Split flow to see spending here.</p>
              <Link to="/">
                <Button className="mt-4">Go to Split</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="participant" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="participant" className="flex items-center gap-2">
                <Users className="w-4 h-4" /> By person
              </TabsTrigger>
              <TabsTrigger value="month" className="flex items-center gap-2">
                <Calendar className="w-4 h-4" /> By month
              </TabsTrigger>
            </TabsList>
            <TabsContent value="participant" className="space-y-3 mt-4">
              {summary.byParticipant.map((p) => (
                <Card key={p.participantId}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white font-medium"
                        style={{ backgroundColor: p.participantColor }}
                      >
                        {p.participantName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium">{p.participantName}</p>
                        <p className="text-xs text-muted-foreground">{p.receiptCount} receipt{p.receiptCount !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <p className="font-semibold">{formatMoneyMinor(p.totalPaidMinor, currencyCode)}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
            <TabsContent value="month" className="space-y-3 mt-4">
              {summary.byMonth.map((m) => (
                <Card key={m.yearMonth}>
                  <CardContent className="py-4 flex items-center justify-between">
                    <div>
                      <p className="font-medium">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.receiptCount} receipt{m.receiptCount !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="font-semibold">{formatMoneyMinor(m.totalMinor, currencyCode)}</p>
                  </CardContent>
                </Card>
              ))}
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}
