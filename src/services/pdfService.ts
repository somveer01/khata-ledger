import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Paths, File } from 'expo-file-system';
import { Platform } from 'react-native';
import { Customer, Transaction, Business, VillageSummary } from '../types';
import { formatCurrency, toRupees } from '../utils/money';
import { formatDisplayDate, formatUpperDate } from '../utils/date';
import { computeLedgerWithRunningBalances } from './accounting';

export const PdfService = {
  lastGeneratedHtml: '',
  isSharingInProgress: false,

  async _processHtmlToUri(html: string, title: string = 'Khata_Report'): Promise<string> {
    this.lastGeneratedHtml = html;
    if (Platform.OS === 'web') {
      return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
    }
    const result = await Print.printToFileAsync({ html, base64: true });

    // In Expo Go on Android/iOS, printToFileAsync writes to cache/Print/ which
    // expo-sharing's FilePermissionService rejects ("Not allowed to read file under given URL").
    // Saving the base64 content to Paths.document places it in the accessible sandbox.
    if (result.base64) {
      try {
        const sanitizedTitle = (title || 'Khata_Report')
          .replace(/[^\w\u0900-\u097F]/g, '_')
          .replace(/_+/g, '_')
          .substring(0, 40);
        const fileName = `${sanitizedTitle}_${Date.now()}.pdf`;
        const file = new File(Paths.document, fileName);
        file.create({ overwrite: true });
        file.write(result.base64, { encoding: 'base64' });
        return file.uri;
      } catch (saveErr) {
        console.warn('Saving base64 PDF to Paths.document failed, using result.uri:', saveErr);
      }
    }
    return result.uri;
  },

  printHtmlOnWeb(html: string) {
    if (typeof document === 'undefined') return;
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow?.document;
      if (doc) {
        doc.open();
        doc.write(html);
        doc.close();
        iframe.contentWindow?.focus();
        setTimeout(() => {
          try {
            iframe.contentWindow?.print();
          } catch (e) {
            console.error('Print iframe error:', e);
          }
          setTimeout(() => {
            try {
              document.body.removeChild(iframe);
            } catch {}
          }, 2000);
        }, 300);
      }
    } catch (e) {
      console.error('printHtmlOnWeb error:', e);
      if (typeof window !== 'undefined') {
        const blob = new Blob([html], { type: 'text/html' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    }
  },

  /**
   * Generates a clean, branded PDF statement for a customer ledger
   * matching the paper ledger reference format.
   */
  async generateCustomerLedgerPdf(
    business: Business,
    customer: Customer,
    transactions: Transaction[]
  ): Promise<string> {
    const ledger = computeLedgerWithRunningBalances(customer.openingBalancePaise, transactions);

    let rowsHtml = '';
    for (const tx of ledger) {
      const isSale = tx.type === 'CREDIT_SALE';
      const isPayment = tx.type === 'PAYMENT';
      const debitStr = isSale ? formatCurrency(tx.amountPaise) : '-';
      const creditStr = isPayment ? formatCurrency(tx.amountPaise) : '-';
      const balanceStr = formatCurrency(tx.runningBalancePaise || 0);

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 6px; font-size: 11px;">${formatDisplayDate(tx.date)}</td>
          <td style="padding: 8px 6px; font-size: 11px;">
            <strong>${tx.description || '-'}</strong>
            ${tx.quantity ? `<br/><span style="color:#64748b; font-size:10px;">Qty: ${tx.quantity} ${tx.unit || ''} @ ${formatCurrency(tx.ratePaise || 0)}</span>` : ''}
          </td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: center; color: #64748b;">${tx.referenceNumber || '-'}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #dc2626; font-weight: 600;">${debitStr}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #16a34a; font-weight: 600;">${creditStr}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; font-weight: 700;">${balanceStr}</td>
        </tr>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Customer Ledger - ${customer.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 24px; }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 16px; }
          .biz-name { font-size: 20px; font-weight: bold; color: #1e3a8a; }
          .biz-sub { font-size: 11px; color: #475569; margin-top: 4px; }
          .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-bottom: 16px; }
          .summary-grid { display: flex; justify-content: space-between; margin-top: 8px; }
          .summary-box { text-align: center; flex: 1; border-right: 1px solid #cbd5e1; }
          .summary-box:last-child { border-right: none; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th { background: #1e3a8a; color: white; padding: 8px 6px; font-size: 11px; text-align: left; }
          th.right { text-align: right; }
          th.center { text-align: center; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="biz-name">${business.name}</div>
          <div class="biz-sub">${business.address || ''} | Contact: ${business.phone}</div>
          ${business.upiId ? `<div class="biz-sub">Pay via UPI: <strong>${business.upiId}</strong></div>` : ''}
        </div>

        <div class="card">
          <div style="display: flex; justify-content: space-between;">
            <div>
              <div style="font-size: 14px; font-weight: bold;">खाता / Account: ${customer.name}</div>
              <div style="font-size: 11px; color: #64748b;">गाँव / Village: <strong>${customer.villageName || 'N/A'}</strong> | Mobile: ${customer.mobile}</div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 10px; color: #64748b;">Statement Date</div>
              <div style="font-size: 12px; font-weight: bold;">${formatDisplayDate(new Date())}</div>
            </div>
          </div>

          <div class="summary-grid">
            <div class="summary-box">
              <div style="font-size: 10px; color: #64748b;">पिछला बकाया (Opening)</div>
              <div style="font-size: 12px; font-weight: bold;">${formatCurrency(customer.openingBalancePaise)}</div>
            </div>
            <div class="summary-box">
              <div style="font-size: 10px; color: #64748b;">कुल उधार (Total Udhaar)</div>
              <div style="font-size: 12px; font-weight: bold; color: #dc2626;">${formatCurrency(customer.totalCreditPaise || 0)}</div>
            </div>
            <div class="summary-box">
              <div style="font-size: 10px; color: #64748b;">कुल जमा (Total Jama)</div>
              <div style="font-size: 12px; font-weight: bold; color: #16a34a;">${formatCurrency(customer.totalPaymentPaise || 0)}</div>
            </div>
            <div class="summary-box">
              <div style="font-size: 10px; color: #64748b;">वर्तमान बाकी (Current Due)</div>
              <div style="font-size: 14px; font-weight: 800; color: #dc2626;">${formatCurrency(customer.currentBalancePaise)}</div>
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>तिथि<br/>Date</th>
              <th>विवरण<br/>Particulars</th>
              <th class="center">बिल नं.<br/>Ref No.</th>
              <th class="right">नाम (+)<br/>Debit (Rs.)</th>
              <th class="right">जमा (-)<br/>Credit (Rs.)</th>
              <th class="right">शेष<br/>Balance (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          Generated via Ledger • डिजिटल खाता बही
        </div>
      </body>
      </html>
    `;

    return await this._processHtmlToUri(html, `${customer.name}_Statement`);
  },

  /**
   * Generates a Village Outstanding Due Report PDF
   */
  async generateVillageReportPdf(
    business: Business,
    summaries: VillageSummary[],
    totalOutstandingPaise: number
  ): Promise<string> {
    let rowsHtml = '';
    for (const v of summaries) {
      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 10px 8px; font-size: 12px; font-weight: bold;">${v.villageName}</td>
          <td style="padding: 10px 8px; font-size: 12px; text-align: center;">${v.customerCount}</td>
          <td style="padding: 10px 8px; font-size: 12px; text-align: center; color: #dc2626;">${v.customersWithDueCount}</td>
          <td style="padding: 10px 8px; font-size: 12px; text-align: right; color: #dc2626; font-weight: 700;">${formatCurrency(v.totalOutstandingPaise)}</td>
        </tr>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Village Due Report - ${business.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 24px; }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
          .biz-name { font-size: 20px; font-weight: bold; color: #1e3a8a; }
          .report-title { font-size: 16px; font-weight: bold; margin-top: 8px; }
          table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          th { background: #1e3a8a; color: white; padding: 10px 8px; font-size: 12px; text-align: left; }
          th.right { text-align: right; }
          th.center { text-align: center; }
          .total-box { margin-top: 20px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 12px; text-align: right; font-size: 16px; font-weight: bold; color: #991b1b; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="biz-name">${business.name}</div>
          <div style="font-size: 11px; color: #64748b;">${business.address || ''} | Contact: ${business.phone}</div>
          <div class="report-title">गांव अनुसार कुल बाकी रिपोर्ट (Village-Wise Due Report)</div>
          <div style="font-size: 11px; color: #64748b;">Date: ${formatDisplayDate(new Date())}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th>गाँव का नाम / Village</th>
              <th class="center">कुल ग्राहक / Customers</th>
              <th class="center">बाकी ग्राहक / Dues Count</th>
              <th class="right">कुल बकाया / Total Due</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="total-box">
          कुल समग्र बाकी (All Villages Outstanding): ${formatCurrency(totalOutstandingPaise)}
        </div>

        <div class="footer">
          Generated via Ledger • डिजिटल खाता बही
        </div>
      </body>
      </html>
    `;

    return await this._processHtmlToUri(html, 'Village_Report');
  },

  /**
   * Generates a date-range transaction statement PDF.
   */
  async generateDateRangeReportPdf(
    business: Business,
    fromDateStr: string,
    toDateStr: string,
    transactions: (Transaction & { customerName?: string; villageName?: string })[],
    creditTotalPaise: number,
    paymentTotalPaise: number
  ): Promise<string> {
    const netDiff = creditTotalPaise - paymentTotalPaise;

    let rowsHtml = '';
    for (const tx of transactions) {
      const isSale = tx.type === 'CREDIT_SALE';
      const debitStr = isSale ? formatCurrency(tx.amountPaise) : '-';
      const creditStr = !isSale ? formatCurrency(tx.amountPaise) : '-';

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 6px; font-size: 11px;">${formatUpperDate(tx.date)}</td>
          <td style="padding: 8px 6px; font-size: 11px;">
            <strong>${tx.customerName || '-'}</strong>
            ${tx.villageName ? `<br/><span style="color:#64748b; font-size:10px;">${tx.villageName}</span>` : ''}
          </td>
          <td style="padding: 8px 6px; font-size: 11px;">${tx.description || '-'}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #dc2626; font-weight: 600;">${debitStr}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #16a34a; font-weight: 600;">${creditStr}</td>
        </tr>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Date Range Report - ${business.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 24px; }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
          .biz-name { font-size: 20px; font-weight: bold; color: #1e3a8a; }
          .report-title { font-size: 16px; font-weight: bold; margin-top: 8px; }
          .period-tag { display: inline-block; background: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 4px; font-weight: 600; font-size: 12px; margin-top: 6px; }
          .summary-grid { display: flex; justify-content: space-between; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 14px; }
          .summary-box { text-align: center; flex: 1; border-right: 1px solid #cbd5e1; }
          .summary-box:last-child { border-right: none; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #1e3a8a; color: white; padding: 10px 8px; font-size: 12px; text-align: left; }
          th.right { text-align: right; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="biz-name">${business.name}</div>
          <div style="font-size: 11px; color: #64748b;">${business.address || ''} | Contact: ${business.phone}</div>
          <div class="report-title">लेनदेन विवरण रिपोर्ट (Financial Statement)</div>
          <div class="period-tag">${formatUpperDate(fromDateStr)} to ${formatUpperDate(toDateStr)}</div>
        </div>

        <div class="summary-grid">
          <div class="summary-box">
            <div style="font-size: 10px; color: #64748b;">कुल उधार (Total Udhaar)</div>
            <div style="font-size: 14px; font-weight: bold; color: #dc2626;">${formatCurrency(creditTotalPaise)}</div>
          </div>
          <div class="summary-box">
            <div style="font-size: 10px; color: #64748b;">कुल जमा (Total Jama)</div>
            <div style="font-size: 14px; font-weight: bold; color: #16a34a;">${formatCurrency(paymentTotalPaise)}</div>
          </div>
          <div class="summary-box">
            <div style="font-size: 10px; color: #64748b;">शुद्ध अंतर (Net Diff)</div>
            <div style="font-size: 14px; font-weight: bold; color: #1e3a8a;">${formatCurrency(netDiff)}</div>
          </div>
          <div class="summary-box">
            <div style="font-size: 10px; color: #64748b;">कुल प्रविष्टियाँ (Total Txs)</div>
            <div style="font-size: 14px; font-weight: bold;">${transactions.length}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>तारीख / Date</th>
              <th>ग्राहक व गाँव / Customer & Village</th>
              <th>विवरण / Particulars</th>
              <th class="right">उधार (नाम) / Debit</th>
              <th class="right">जमा (जमा) / Credit</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="5" style="text-align:center; padding:16px; color:#64748b;">No transactions in this period</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Generated via Ledger • डिजिटल खाता बही
        </div>
      </body>
      </html>
    `;

    return await this._processHtmlToUri(html, `Transactions_${fromDateStr}_to_${toDateStr}`);
  },

  /**
   * Shares or prints a generated PDF file.
   * On Web: Opens browser native print dialog with the exact styled statement.
   * On Native: Opens Android/iOS share sheet (WhatsApp, Drive, Email, etc.),
   *            with automatic fallback to the system Print / Save-as-PDF dialog.
   */
  async sharePdf(uri: string, customHtml?: string, title: string = 'Ledger Statement'): Promise<void> {
    // Prevent duplicate triggers / concurrent calls while sharing
    if (this.isSharingInProgress) {
      return;
    }
    this.isSharingInProgress = true;

    try {
      const html = customHtml || this.lastGeneratedHtml;

      // Web Platform
      if (Platform.OS === 'web') {
        if (html) {
          this.printHtmlOnWeb(html);
          return;
        }
        if (uri && uri.startsWith('data:text/html')) {
          const decoded = decodeURIComponent(uri.replace(/^data:text\/html;charset=utf-8,/, ''));
          this.printHtmlOnWeb(decoded);
          return;
        }
        if (uri && typeof window !== 'undefined') {
          window.open(uri, '_blank');
          return;
        }
        return;
      }

      // Native Platforms (Android & iOS)
      if (uri && !uri.startsWith('data:')) {
        let isSharingAvailable = false;
        try {
          isSharingAvailable = await Sharing.isAvailableAsync().catch(() => false);
        } catch {
          isSharingAvailable = false;
        }

        if (isSharingAvailable) {
          try {
            await Sharing.shareAsync(uri, {
              mimeType: 'application/pdf',
              dialogTitle: title,
              UTI: Platform.OS === 'ios' ? 'com.adobe.pdf' : undefined,
            });
            return;
          } catch (shareErr: any) {
            const errStr = String(shareErr?.message || shareErr || '');
            // User cancellation, dismissed dialog, or temporary native lock are non-fatal
            if (
              errStr.includes('canceled') ||
              errStr.includes('cancelled') ||
              errStr.includes('dismissed') ||
              (errStr.includes('rejected') && !errStr.includes('Not allowed to read file')) ||
              errStr.includes('Another share request')
            ) {
              return;
            }

            // If it's a file permission / sandbox issue, regenerate into Paths.document and re-share
            if (errStr.includes('Not allowed to read file') && html) {
              try {
                const printRes = await Print.printToFileAsync({ html, base64: true });
                if (printRes.base64) {
                  const fallbackFile = new File(Paths.document, `Khata_${Date.now()}.pdf`);
                  fallbackFile.create({ overwrite: true });
                  fallbackFile.write(printRes.base64, { encoding: 'base64' });
                  await Sharing.shareAsync(fallbackFile.uri, {
                    mimeType: 'application/pdf',
                    dialogTitle: title,
                    UTI: Platform.OS === 'ios' ? 'com.adobe.pdf' : undefined,
                  });
                  return;
                }
              } catch (reShareErr) {
                console.warn('Sandboxed re-share failed:', reShareErr);
              }
            }

            console.log('Sharing unavailable, falling back to print dialog:', errStr);
          }
        }

        // Fallback: System Print / Save as PDF manager if Sharing wasn't available or errored
        try {
          await Print.printAsync({ uri });
          return;
        } catch (printUriErr: any) {
          const printStr = String(printUriErr?.message || '');
          if (
            printStr.includes('canceled') ||
            printStr.includes('cancelled') ||
            printStr.includes('dismissed')
          ) {
            return;
          }
          if (html) {
            try {
              await Print.printAsync({ html });
              return;
            } catch (printHtmlErr: any) {
              const htmlStr = String(printHtmlErr?.message || '');
              if (
                htmlStr.includes('canceled') ||
                htmlStr.includes('cancelled') ||
                htmlStr.includes('dismissed')
              ) {
                return;
              }
            }
          }
        }
      }
    } finally {
      // Debounce unlock to allow native sheet dismissal animation to settle
      setTimeout(() => {
        this.isSharingInProgress = false;
      }, 700);
    }
  },

  /**
   * Directly prints or saves PDF via system print manager
   */
  async printPdf(htmlOrUri?: string): Promise<void> {
    const html = htmlOrUri || this.lastGeneratedHtml;
    if (Platform.OS === 'web') {
      if (html) this.printHtmlOnWeb(html);
      return;
    }
    try {
      if (htmlOrUri && htmlOrUri.startsWith('file://')) {
        await Print.printAsync({ uri: htmlOrUri });
      } else if (html) {
        await Print.printAsync({ html });
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (!msg.includes('canceled') && !msg.includes('cancelled') && !msg.includes('dismissed')) {
        throw err;
      }
    }
  },

  /**
   * Generates and shares a CSV file of transactions
   */
  async exportTransactionsCsv(customerName: string, transactions: Transaction[]): Promise<void> {
    let csv = 'Date,Description,Quantity,Unit,Rate (Rs),Type,Debit (Rs),Credit (Rs),Reference\n';
    for (const tx of transactions) {
      const debit = tx.type === 'CREDIT_SALE' ? toRupees(tx.amountPaise) : 0;
      const credit = tx.type === 'PAYMENT' ? toRupees(tx.amountPaise) : 0;
      const rate = tx.ratePaise ? toRupees(tx.ratePaise) : 0;
      csv += `"${tx.date}","${tx.description.replace(/"/g, '""')}","${tx.quantity || ''}","${tx.unit || ''}","${rate}","${tx.type}","${debit}","${credit}","${tx.referenceNumber || ''}"\n`;
    }

    const fileName = `Khata_${customerName.replace(/\s+/g, '_')}_${Date.now()}.csv`;

    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return;
      }
    }

    const file = new File(Paths.document, fileName);
    file.create({ overwrite: true });
    file.write(csv);

    if (await Sharing.isAvailableAsync().catch(() => false)) {
      try {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export CSV Ledger',
        });
      } catch (err: any) {
        // Silently ignore cancel / dismiss
      }
    }
  },

  /**
   * Generates a dedicated Due Date / Overdue Report PDF statement
   */
  async generateDueReportPdf(
    business: Business,
    customersWithDues: {
      customer: Customer;
      dueInfo: { status: string; daysDiff: number; labelKey: string };
    }[],
    reportTitle: string,
    totalDuePaise: number
  ): Promise<string> {
    let rowsHtml = '';
    for (const item of customersWithDues) {
      const c = item.customer;
      const statusLabel =
        item.dueInfo.status === 'OVERDUE'
          ? `<span style="color:#dc2626; font-weight:bold;">${item.dueInfo.daysDiff} days late</span>`
          : item.dueInfo.status === 'DUE_TODAY'
          ? `<span style="color:#d97706; font-weight:bold;">Due Today</span>`
          : item.dueInfo.status === 'UPCOMING'
          ? `<span style="color:#2563eb;">Upcoming</span>`
          : `<span style="color:#94a3b8;">-</span>`;

      rowsHtml += `
        <tr style="border-bottom: 1px solid #e2e8f0;">
          <td style="padding: 8px 6px; font-size: 11px;">
            <strong>${c.name}</strong>
            <br/><span style="color:#64748b; font-size:10px;">${c.mobile}</span>
          </td>
          <td style="padding: 8px 6px; font-size: 11px;">${c.villageName || '-'}</td>
          <td style="padding: 8px 6px; font-size: 11px;">
            <strong>${c.dueDate ? formatUpperDate(c.dueDate) : '-'}</strong>
          </td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: center;">${statusLabel}</td>
          <td style="padding: 8px 6px; font-size: 11px; text-align: right; color: #dc2626; font-weight: 700;">
            ${formatCurrency(c.currentBalancePaise)}
          </td>
        </tr>
      `;
    }

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${reportTitle} - ${business.name}</title>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 24px; }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
          .biz-name { font-size: 20px; font-weight: bold; color: #1e3a8a; }
          .report-title { font-size: 16px; font-weight: bold; margin-top: 8px; color: #dc2626; }
          .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; margin-top: 14px; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th { background: #1e3a8a; color: white; padding: 10px 8px; font-size: 12px; text-align: left; }
          th.right { text-align: right; }
          th.center { text-align: center; }
          .footer { margin-top: 24px; text-align: center; font-size: 10px; color: #94a3b8; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="biz-name">${business.name}</div>
          <div style="font-size: 11px; color: #64748b;">${business.address || ''} | Contact: ${business.phone}</div>
          <div class="report-title">${reportTitle}</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">दिनांक / Date: ${formatUpperDate(new Date())}</div>
        </div>

        <div class="card">
          <div>
            <div style="font-size: 11px; color: #64748b;">कुल ग्राहक (Total Customers)</div>
            <div style="font-size: 16px; font-weight: bold;">${customersWithDues.length}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 11px; color: #64748b;">कुल बकाया राशि (Total Due)</div>
            <div style="font-size: 18px; font-weight: 800; color: #dc2626;">${formatCurrency(totalDuePaise)}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th>ग्राहक का नाम (Customer)</th>
              <th>गाँव (Village)</th>
              <th>देय तिथि (Due Date)</th>
              <th class="center">स्थिति (Status)</th>
              <th class="right">बकाया राशि (Due Amount)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <div class="footer">
          लेजर • Digital Ledger Report • Generated on ${formatUpperDate(new Date())}
        </div>
      </body>
      </html>
    `;

    return await this._processHtmlToUri(html, reportTitle || 'Due_Report');
  },
};
