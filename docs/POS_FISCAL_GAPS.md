# German POS fiscal gaps

Assessment dated 2026-11-23. BeautyHub Stage 6 is a development POS. The scope includes manual appointment and retail records, simulated card payments, receipts for internal use, refunds, and daily reconciliation. A deployment assessment should establish whether the planned installation is an electronic recording system with a cash register function under section 146a AO and KassenSichV.

| Area | Current implementation | Production work |
| --- | --- | --- |
| Technical security device (TSE) | PostgreSQL stores business movements and request keys. | Select a certified TSE integration where applicable. Account for transaction start and finish, signatures, device and register identifiers, offline incidents, export and verification. |
| DSFinV-K | Location reports summarize development movements. | Map the production ledger, tenders, discounts, vouchers, refunds, tax lines and closing data to the applicable DSFinV-K specification. Verify a complete audit export with a representative test dataset. |
| Receipts and VAT | Staff can download internal plain-text payment records. | Establish receipt contents and delivery timing and implement required tax fields and TSE data. Have German tax advice confirm VAT treatment for sales, deposits, discounts, and any future prepaid vouchers. |
| Registration and retention | No fiscal registration workflow or immutable fiscal archive. | Establish the operator's registration procedure through ELSTER or ERiC when applicable, and verify retention, export access and migration procedures. |
| Payment provider | Card entries and refunds are simulated. | Select and verify a payment provider and use production settlement and reconciliation evidence. |

The current voucher adapts the checkout price by a fixed amount and is consumed once. It represents a promotional discount in development. Prepaid gift balances and their tax treatment require a separate implementation.

## Sources

- [Finance Ministry guidance on TSE, receipt issuance and DSFinV-K](https://www.bundesfinanzministerium.de/Content/DE/FAQ/FAQ-steuergerechtigkeit-belegpflicht.html)
- [KassenSichV in the official 2026 tax handbook](https://ao.bundesfinanzministerium.de/ao/2026/Abgabenordnung/Vierter-Teil/Zweiter-Abschnitt/Erster-Unterabschnitt/Paragraf-146a/KassenSichV.html)
- [Finance Ministry notice on electronic reporting under section 146a(4) AO](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Weitere_Steuerthemen/Abgabenordnung/2024-06-28-mitteilungsverpflichtung-nach-AO.pdf?__blob=publicationFile&v=7)
