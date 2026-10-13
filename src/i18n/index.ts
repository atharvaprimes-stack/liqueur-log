import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      appName: 'Liqueur Log',
      tabs: {
        home: 'Home',
        tables: 'Tables',
        stock: 'Stock',
        reports: 'Reports',
        menu: 'Menu',
      },
      roles: {
        ADMIN: 'Admin',
        STAFF: 'Staff',
      },
      common: {
        back: 'Go back',
        signOut: 'Sign out',
      },
      auth: {
        invalid: 'Invalid mobile number or MPIN.',
        inactive: 'This account is inactive.',
        ambiguous: 'This mobile number matches more than one business. Contact your provider.',
        locked: 'Too many attempts. Try again in 15 minutes.',
        unavailable: 'Unable to sign in.',
      },
      login: {
        title: 'Sign in',
        subtitle: 'Use the mobile number and MPIN for this business.',
        mobileLabel: 'Mobile number',
        mobilePlaceholder: '10-digit mobile number',
        mpinLabel: 'MPIN',
        mpinPlaceholder: '4-digit MPIN',
        submit: 'Sign in',
      },
      home: {
        title: 'Home',
        summaryTitle: 'Tonight',
        summaryBody: 'Open tables, sales, and the close of service will be summarized here.',
        alertsTitle: 'Alerts',
        alertsBody: 'Low stock, long-waiting tables, and other items that need attention will appear here.',
      },
      tables: {
        title: 'Tables',
        body: 'The live floor will show every table, who is seated, and which orders are still open.',
      },
      stock: {
        title: 'Stock',
        fullAccess: 'Full access',
        viewOnly: 'View only',
        adminBody: 'Review every item and update quantities for this business.',
        staffBody: 'Review item quantities. Only an admin can change stock.',
      },
      reports: {
        title: 'Reports',
        body: 'Sales, activity, and end-of-day reports for this business will appear here.',
      },
      menu: {
        title: 'Menu',
        appearance: 'Appearance',
        appearanceBody: 'Choose a look that stays readable where you work.',
        light: 'Light',
        dark: 'Dark',
        amber: 'Warm amber',
        amberHint: 'Easier to read in a dim bar.',
        language: 'Language',
        english: 'English',
        marathi: 'मराठी',
        staff: 'Staff',
        staffBody: 'Add people, set an MPIN, or turn access on and off.',
        staffDenied: 'Staff accounts can work in this business. They cannot change other people or business settings.',
        manageStaff: 'Manage staff',
      },
      staff: {
        title: 'Manage staff',
        body: 'People you add can sign in with their mobile number and MPIN for this business only.',
        add: 'Add staff',
        active: 'Active',
        inactive: 'Inactive',
        edit: 'Edit',
        activate: 'Activate',
        deactivate: 'Deactivate',
        empty: 'No staff yet. Add the first team member.',
        saveError: 'Unable to save staff.',
        updateError: 'Unable to update staff.',
        deactivateTitle: 'Deactivate {{name}}?',
        deactivateBody: 'They will not be able to sign in.',
        cancel: 'Cancel',
        createTitle: 'Add staff',
        editTitle: 'Edit staff',
        createSubmit: 'Create staff',
        saveSubmit: 'Save changes',
        scope: 'Staff can sign in only for this business.',
        name: 'Name',
        namePlaceholder: 'Staff name',
        mobile: 'Mobile number',
        mobilePlaceholder: '10 digits',
        mpin: 'Initial MPIN',
        newMpin: 'New MPIN',
        mpinPlaceholder: '4 digits',
        keepMpin: 'Leave blank to keep the current MPIN',
      },
    },
  },
  mr: {
    translation: {
      appName: 'लिकर लॉग',
      tabs: {
        home: 'होम',
        tables: 'टेबल्स',
        stock: 'स्टॉक',
        reports: 'रिपोर्ट',
        menu: 'मेनू',
      },
      roles: {
        ADMIN: 'व्यवस्थापक',
        STAFF: 'कर्मचारी',
      },
      common: {
        back: 'मागे जा',
        signOut: 'बाहेर पडा',
      },
      auth: {
        invalid: 'मोबाइल नंबर किंवा एमपिन चुकीचा आहे.',
        inactive: 'हे खाते निष्क्रिय आहे.',
        ambiguous: 'हा मोबाइल नंबर एकापेक्षा जास्त व्यवसायांसाठी आहे. प्रदात्याशी संपर्क करा.',
        locked: 'खूप वेळा प्रयत्न झाले. 15 मिनिटांनी पुन्हा प्रयत्न करा.',
        unavailable: 'प्रवेश करता आला नाही.',
      },
      login: {
        title: 'प्रवेश',
        subtitle: 'या व्यवसायासाठी मोबाइल नंबर आणि एमपिन वापरा.',
        mobileLabel: 'मोबाइल नंबर',
        mobilePlaceholder: '१० अंकी मोबाइल नंबर',
        mpinLabel: 'एमपिन',
        mpinPlaceholder: '४ अंकी एमपिन',
        submit: 'प्रवेश',
      },
      home: {
        title: 'होम',
        summaryTitle: 'आजची रात्र',
        summaryBody: 'उघडे टेबल, विक्री, आणि दिवसअखेरचा सारांश येथे दिसेल.',
        alertsTitle: 'सूचना',
        alertsBody: 'कमी स्टॉक, जास्त वेळ थांबलेले टेबल, आणि लक्ष द्याव्या लागणाऱ्या गोष्टी येथे दिसतील.',
      },
      tables: {
        title: 'टेबल्स',
        body: 'प्रत्येक टेबल, कोण बसले आहे, आणि कोणती ऑर्डर अजून उघडी आहे हे येथे दिसेल.',
      },
      stock: {
        title: 'स्टॉक',
        fullAccess: 'पूर्ण अधिकार',
        viewOnly: 'फक्त पहा',
        adminBody: 'या व्यवसायातील प्रत्येक वस्तू पहा आणि प्रमाण बदला.',
        staffBody: 'वस्तूंचे प्रमाण पहा. स्टॉक बदलण्याचा अधिकार फक्त व्यवस्थापकाकडे आहे.',
      },
      reports: {
        title: 'रिपोर्ट',
        body: 'विक्री, हालचाल, आणि दिवसअखेरचे अहवाल येथे दिसतील.',
      },
      menu: {
        title: 'मेनू',
        appearance: 'देखावा',
        appearanceBody: 'जिथे तुम्ही काम करता तिथे वाचता येईल असा देखावा निवडा.',
        light: 'हलका',
        dark: 'गडद',
        amber: 'उबदार अंबर',
        amberHint: 'अंधुक बारमध्ये वाचायला सोपे.',
        language: 'भाषा',
        english: 'English',
        marathi: 'मराठी',
        staff: 'कर्मचारी',
        staffBody: 'लोक जोडा, एमपिन ठेवा, किंवा प्रवेश सुरू किंवा बंद करा.',
        staffDenied: 'कर्मचारी या व्यवसायात काम करू शकतात. ते इतर लोकांना किंवा व्यवसाय सेटिंग्ज बदलू शकत नाहीत.',
        manageStaff: 'कर्मचारी व्यवस्थापन',
      },
      staff: {
        title: 'कर्मचारी व्यवस्थापन',
        body: 'तुम्ही जोडलेले लोक फक्त या व्यवसायासाठी मोबाइल नंबर आणि एमपिनने प्रवेश करू शकतात.',
        add: 'कर्मचारी जोडा',
        active: 'सक्रिय',
        inactive: 'निष्क्रिय',
        edit: 'संपादन',
        activate: 'सक्रिय करा',
        deactivate: 'निष्क्रिय करा',
        empty: 'अजून कर्मचारी नाहीत. पहिल्या व्यक्तीला जोडा.',
        saveError: 'कर्मचारी जतन करता आले नाही.',
        updateError: 'कर्मचारी अद्ययावत करता आले नाही.',
        deactivateTitle: '{{name}} यांना निष्क्रिय करायचे?',
        deactivateBody: 'ते प्रवेश करू शकणार नाहीत.',
        cancel: 'रद्द करा',
        createTitle: 'कर्मचारी जोडा',
        editTitle: 'कर्मचारी संपादन',
        createSubmit: 'कर्मचारी तयार करा',
        saveSubmit: 'बदल जतन करा',
        scope: 'कर्मचारी फक्त या व्यवसायासाठी प्रवेश करू शकतात.',
        name: 'नाव',
        namePlaceholder: 'कर्मचाऱ्याचे नाव',
        mobile: 'मोबाइल नंबर',
        mobilePlaceholder: '10 अंक',
        mpin: 'सुरुवातीचा एमपिन',
        newMpin: 'नवा एमपिन',
        mpinPlaceholder: '4 अंक',
        keepMpin: 'सध्याचा एमपिन ठेवायचा असल्यास रिकामे सोडा',
      },
    },
  },
} as const;

export type AppLanguage = 'en' | 'mr';

if (!i18n.isInitialized) {
  i18n.use(initReactI18next);
  void i18n.init({
    resources,
    lng: 'en',
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });
}

export function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return value === 'en' || value === 'mr';
}

export default i18n;
