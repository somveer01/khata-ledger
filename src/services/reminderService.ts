import { Linking, Share, Platform } from 'react-native';
import { Customer, Business, SupportedLanguage } from '../types';
import { formatCurrency } from '../utils/money';
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
};
