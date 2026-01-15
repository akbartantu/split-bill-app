# BillSplit Pro

## Overview
BillSplit Pro helps groups split bills fairly without spreadsheets or manual math. It lets you scan or enter receipts, assign items to people, and see who owes what. It is built for real-world scenarios like multiple receipts, shared items, and different payers. The app keeps the process transparent and produces clear payment instructions.

## Key Features
- Multiple receipt support
- Receipt scanning (OCR) plus manual input
- Item-level assignment per person
- Per-receipt tax, service, and tip
- Per-receipt payer selection (who paid first)
- Automatic settlement (who pays whom, how much)
- Multi-currency support (display and formatting)
- Transparent calculation (fair share vs paid)

## How the App Works (High-Level Flow)
1) Add people  
2) Add one or more receipts  
3) Review and edit items  
4) Assign items to people  
5) Add tax, service, and tip per receipt  
6) Select who paid each receipt  
7) View the split and settlement result

The app calculates each person’s fair share, compares it to what they paid, and produces payment instructions.

## Settlement Logic (Simple Explanation)
Each person has a fair share based on the items they were assigned.  
Each person also has a paid amount based on who paid the receipts.  
The difference between paid and fair share is the net balance.  
People who paid less than their fair share pay those who paid more until everyone is even.

## Example Scenario (Short)
Three friends eat together. One person pays the whole bill.  
The app splits items, compares what each person owes, and tells the other two who to pay and how much.

## How to Use the App (Step by Step)
1) Go to **People** and add everyone in the group.  
2) Go to **Items** and add receipts (scan or manual).  
3) Review items and edit if needed.  
4) Assign each item to the right people.  
5) Add tax, service, and tip per receipt.  
6) Set **Paid by** for each receipt.  
7) Go to **Split** to see the final settlement instructions.

## Multi-Receipt & Multi-Payer Notes
Each receipt is handled separately, so different receipts can have different payers.  
The app combines everything into one clear result at the end.

## Currency Support
You can choose a currency for the bill.  
The app does not convert between currencies.  
Currency only changes formatting and calculations for that bill.

## Running Locally (For Developers)
**Requirements:** Node.js 18+ and npm

```bash
npm install
npm run dev
```

Environment variables are listed in `.env.example`. Do not add secrets to the repo.

## Project Status
This is an active MVP. It is ready for testing and iteration.

## License
License: TBD

