/**
 * CreatorTrack Google Forms -> Supabase webhook.
 * Configure the three Script Properties documented in README.md, then add an
 * installable "On form submit" trigger for onFormSubmit.
 */
function onFormSubmit(event) {
  if (!event || !event.namedValues) {
    throw new Error("Missing Google Forms submission event.");
  }

  var properties = PropertiesService.getScriptProperties();
  var endpoint = properties.getProperty("CREATORTRACK_WEBHOOK_URL");
  var secret = properties.getProperty("CREATORTRACK_WEBHOOK_SECRET");
  if (!endpoint || !secret) {
    throw new Error("Set CREATORTRACK_WEBHOOK_URL and CREATORTRACK_WEBHOOK_SECRET in Script Properties.");
  }

  var values = event.namedValues;
  var payload = {
    customerName: firstValue(values, "Customer Name"),
    email: firstValue(values, "Email"),
    phone: firstValue(values, "Phone Number"),
    productName: firstValue(values, "Product Interested In"),
    message: firstValue(values, "Message"),
    referralCode: firstValue(values, "Referral Code"),
    campaign: firstValue(values, "Campaign") || "Google Form"
  };

  var response = UrlFetchApp.fetch(endpoint, {
    method: "post",
    contentType: "application/json",
    headers: { Authorization: "Bearer " + secret },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var status = response.getResponseCode();
  if (status < 200 || status >= 300) {
    throw new Error("CreatorTrack webhook returned " + status + ": " + response.getContentText());
  }
}

function firstValue(namedValues, title) {
  var answer = namedValues[title];
  return answer && answer.length ? String(answer[0]).trim() : "";
}

