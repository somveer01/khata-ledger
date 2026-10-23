import { Linking, Share, Platform } from 'react-native';
import { Customer, Business, SupportedLanguage, Transaction } from '../types';
import { formatCurrency, toRupees, amountInWords } from '../utils/money';
import { formatUpperDate } from '../utils/date';

export const ReminderService = {
  /**
   * Generates a polite payment reminder message
   */
  generateReminderMessage(
    business: Business,
    customer: Customer,
    lang: SupportedLanguage = 'hi'
  ): string {
    const formattedDue = formatCurrency(customer.currentBalancePaise);
    const dueDateNotice = customer.dueDate
      ? (lang === 'hi'
          ? `भुगतान देय तिथि: ${formatUpperDate(customer.dueDate)}\n`
          : `Payment Due Date: ${formatUpperDate(customer.dueDate)}\n`)
      : '';

    if (lang === 'hi') {
      return (
        `नमस्ते ${customer.name} जी,\n\n` +
        `आपके खाते का कुल बकाया ₹${formattedDue.replace('₹', '')} है।\n` +
        dueDateNotice +
        `कृपया समय पर भुगतान करने की कृपा करें।\n\n` +
        (business.upiId ? `आप UPI द्वारा भी भुगतान कर सकते हैं: ${business.upiId}\n\n` : '') +
        `दुकान: ${business.name}\n` +
        `संपर्क: ${business.phone}\n` +
        `धन्यवाद!`
      );
    }

    return (
      `Dear ${customer.name},\n\n` +
      `This is a gentle reminder that your pending balance at ${business.name} is ${formattedDue}.\n` +
      dueDateNotice +
      `Kindly clear the pending dues at your earliest convenience.\n\n` +
      (business.upiId ? `You can pay via UPI: ${business.upiId}\n\n` : '') +
      `Contact: ${business.phone}\n` +
      `Thank you!`
    );
  },

  /**
   * Generates a payment confirmation receipt text for sharing
   */
  generateReceiptMessage(
    business: Business,
    customer: Customer,
    amountPaise: number,
    paymentMethod: string,
    refNumber?: string,
    lang: SupportedLanguage = 'hi'
  ): string {
    const amountStr = formatCurrency(amountPaise);
    const balanceStr = formatCurrency(customer.currentBalancePaise);

    if (lang === 'hi') {
      return (
        `*भुगतान रसीद (Payment Receipt)*\n\n` +
        `दुकान: *${business.name}*\n` +
        `ग्राहक: *${customer.name}*\n` +
        `गाँव: *${customer.villageName || '-'}*\n` +
        `प्राप्त रकम: *${amountStr}*\n` +
        `भुगतान माध्यम: *${paymentMethod}*\n` +
        (refNumber ? `रसीद/रेफरेंस नं: *${refNumber}*\n` : '') +
        `शेष बाकी रकम: *${balanceStr}*\n\n` +
        `संपर्क: ${business.phone}\n` +
        `लेन-देन के लिए धन्यवाद!`
      );
    }

    return (
      `*Payment Receipt*\n\n` +
      `Shop: *${business.name}*\n` +
      `Customer: *${customer.name}*\n` +
      `Village: *${customer.villageName || '-'}*\n` +
      `Received Amount: *${amountStr}*\n` +
      `Payment Method: *${paymentMethod}*\n` +
      (refNumber ? `Ref No: *${refNumber}*\n` : '') +
      `Remaining Due: *${balanceStr}*\n\n` +
      `Contact: ${business.phone}\n` +
      `Thank you for your payment!`
    );
  },

  /**
   * Generates a date-wise / period-wise customer ledger bill for WhatsApp
   */
  generateCustomerDateBillMessage(
    business: Business,
    customer: Customer,
    fromDate: string,
    toDate: string,
    customerTxs: Transaction[],
    previousBalancePaise: number,
    lang: SupportedLanguage = 'hi'
  ): string {
    let creditTotal = 0;
    let paymentTotal = 0;
    for (const tx of customerTxs) {
      if (tx.type === 'CREDIT_SALE') creditTotal += tx.amountPaise;
      else if (tx.type === 'PAYMENT') paymentTotal += tx.amountPaise;
    }

    const finalClosingDuePaise = previousBalancePaise + (creditTotal - paymentTotal);

    const periodStr =
      fromDate === toDate
        ? formatUpperDate(fromDate)
        : `${formatUpperDate(fromDate)} से ${formatUpperDate(toDate)}`;

    const entriesList = customerTxs
      .map((tx, idx) => {
        const isSale = tx.type === 'CREDIT_SALE';
        const typeTag = isSale ? '🔴 उधार (+)' : '🟢 जमा (-)';
        const descPart = tx.description ? `\n   विवरण: ${tx.description}` : '';
        const qtyPart = tx.quantity
          ? ` [मात्रा: ${tx.quantity} ${tx.unit || ''}${tx.ratePaise ? ` @ ₹${toRupees(tx.ratePaise)}` : ''}]`
          : '';
        return `${idx + 1}. ➔ *${formatCurrency(tx.amountPaise)}* ${typeTag}${descPart}${qtyPart}`;
      })
      .join('\n\n');

    const entriesSection = entriesList
      ? lang === 'hi'
        ? `*📝 इस अवधि का लेन-देन (${customerTxs.length} प्रविष्टि):*\n\n${entriesList}\n`
        : `*📝 Transactions in Period (${customerTxs.length}):*\n\n${entriesList}\n`
      : lang === 'hi'
      ? `*(इस अवधि में कोई नई प्रविष्टि नहीं)*\n`
      : `*(No transactions in this period)*\n`;

    const custLoc = customer.villageName ? ` (${customer.villageName})` : '';

    if (lang === 'hi') {
      return (
        `*${business.name}* 🏪\n` +
        `*खाता बही पर्ची / रसीद* 📋\n\n` +
        `ग्राहक: *${customer.name}*${custLoc}\n` +
        `📅 दिनांक: *${periodStr}*\n` +
        `─────────────────────\n` +
        `🟣 *1. पिछला बकाया:* *${formatCurrency(previousBalancePaise)}*\n` +
        `─────────────────────\n` +
        entriesSection +
        `─────────────────────\n` +
        `➕ आज का कुल उधार: *+ ${formatCurrency(creditTotal)}*\n` +
        `➖ आज की कुल जमा: *- ${formatCurrency(paymentTotal)}*\n` +
        `═════════════════════\n` +
        `⭐ *कुल अंतिम बकाया: ${formatCurrency(finalClosingDuePaise)}*\n` +
        `_अक्षरों में: ${amountInWords(finalClosingDuePaise)}_\n` +
        (business.upiId ? `\n💳 UPI भुगतान लिंक: ${business.upiId}\n` : '') +
        `\n📞 संपर्क: ${business.phone}\nडिजिटल खाता बही • धन्यवाद! 🙏`
      );
    }

    return (
      `*${business.name}* 🏪\n` +
      `*Customer Statement / Bill* 📋\n\n` +
      `Customer: *${customer.name}*${custLoc}\n` +
      `📅 Period: *${periodStr}*\n` +
      `─────────────────────\n` +
      `🟣 *1. Previous Due:* *${formatCurrency(previousBalancePaise)}*\n` +
      `─────────────────────\n` +
      entriesSection +
      `─────────────────────\n` +
      `➕ New Udhaar (+): *+ ${formatCurrency(creditTotal)}*\n` +
      `➖ Received Jama (-): *- ${formatCurrency(paymentTotal)}*\n` +
      `═════════════════════\n` +
      `⭐ *Net Closing Due: ${formatCurrency(finalClosingDuePaise)}*\n` +
      `_In Words: ${amountInWords(finalClosingDuePaise)}_\n` +
      (business.upiId ? `\n💳 UPI Payment: ${business.upiId}\n` : '') +
      `\n📞 Contact: ${business.phone}\nThank you! 🙏`
    );
  },

  /**
   * Explicitly opens WhatsApp with the pre-filled reminder message.
   * If customer has a 10-digit Indian phone number, pre-fills country code 91.
   */
  async sendViaWhatsApp(phone: string, message: string): Promise<boolean> {
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const fullPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const encoded = encodeURIComponent(message);
    const url = `whatsapp://send?phone=${fullPhone}&text=${encoded}`;
    const webFallback = `https://wa.me/${fullPhone}?text=${encoded}`;

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        await Linking.openURL(webFallback);
        return true;
      }
    } catch {
      // Fall back to general native share
      return this.shareGeneral(message);
    }
  },

  /**
   * Opens Android native share sheet
   */
  async shareGeneral(message: string): Promise<boolean> {
    try {
      await Share.share({
        message,
        title: 'Ledger Statement',
      });
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Opens WhatsApp directly with contact picker to share a message
   */
  async shareToWhatsApp(message: string): Promise<boolean> {
    const encoded = encodeURIComponent(message);
    const url = `whatsapp://send?text=${encoded}`;
    const webFallback = `https://api.whatsapp.com/send?text=${encoded}`;

    try {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.open(webFallback, '_blank');
        return true;
      }
      const canOpen = await Linking.canOpenURL(url);
      if (canOpen) {
        await Linking.openURL(url);
        return true;
      } else {
        await Linking.openURL(webFallback);
        return true;
      }
    } catch {
      return this.shareGeneral(message);
    }
  },
};
