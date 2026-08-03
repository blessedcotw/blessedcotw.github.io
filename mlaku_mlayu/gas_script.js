/**
 * Google Apps Script for WhatsApp Sheets Sender
 * Deploy this as a Web App:
 * 1. Click "Deploy" > "New deployment"
 * 2. Select type: "Web app"
 * 3. Set "Execute as": "Me"
 * 4. Set "Who has access": "Anyone"
 * 5. Deploy, authorize permissions, and copy the Web App URL.
 */

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  var data = sheet.getDataRange().getValues();
  
  if (data.length < 2) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: "Sheet is empty or contains no data rows."
    })).setMimeType(ContentService.MimeType.JSON);
  }
  
  var headers = data[0].map(function(h) { return h.toString().trim().toLowerCase(); });
  
  // Find indices of Name, Phone, and Kategori columns
  var nameIndex = -1;
  var phoneIndex = -1;
  var categoryIndex = -1;
  
  // Look for common headers
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header.indexOf("nama") !== -1 || header.indexOf("name") !== -1) {
      nameIndex = i;
    }
    if (header.indexOf("nomor") !== -1 || header.indexOf("no") !== -1 || header.indexOf("phone") !== -1 || header.indexOf("telp") !== -1 || header.indexOf("wa") !== -1) {
      phoneIndex = i;
    }
    if (header.indexOf("kategori") !== -1 || header.indexOf("category") !== -1 || header.indexOf("tipe") !== -1 || header.indexOf("type") !== -1) {
      categoryIndex = i;
    }
  }
  
  // Fallbacks if headers not explicitly matched
  if (nameIndex === -1 && headers.length > 0) nameIndex = 0; // default to first column
  if (phoneIndex === -1 && headers.length > 1) phoneIndex = 1; // default to second column
  
  var contacts = [];
  
  for (var r = 1; r < data.length; r++) {
    var row = data[r];
    var name = nameIndex !== -1 ? row[nameIndex] : "";
    var phone = phoneIndex !== -1 ? row[phoneIndex] : "";
    var category = categoryIndex !== -1 ? row[categoryIndex] : "";
    
    // Clean string representations
    name = name.toString().trim();
    phone = phone.toString().trim();
    category = category.toString().trim();
    
    if (name || phone) {
      contacts.push({
        id: r, // Row number as identifier
        name: name,
        phone: phone,
        category: category
      });
    }
  }
  
  var result = {
    status: "success",
    sheetName: sheet.getName(),
    headers: data[0],
    matchedHeaders: {
      nameColumn: nameIndex !== -1 ? data[0][nameIndex] : "None",
      phoneColumn: phoneIndex !== -1 ? data[0][phoneIndex] : "None",
      categoryColumn: categoryIndex !== -1 ? data[0][categoryIndex] : "None"
    },
    contacts: contacts
  };
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}
