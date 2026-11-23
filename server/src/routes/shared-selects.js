const titleColumns = `id,name,author,isbn,pages,genres,notes,large_print AS "largePrint",audio,cover_url AS "coverUrl",publisher,synopsis,date_published AS "datePublished",binding,language,revision,
  ARRAY(SELECT label_id FROM title_label_assignments WHERE title_id=titles.id ORDER BY label_id) AS "labelIds"`;
const clubColumns = 'id,name,branch,size,cadence,cadence_offset AS "cadenceOffset",meeting_weekday AS "meetingWeekday",meeting_occurrence AS "meetingOccurrence",pickup_weekday AS "pickupWeekday",pickup_occurrence AS "pickupOccurrence",pickup_at_previous_meeting AS "pickupAtPreviousMeeting",pickup,address,revision';
const kitSelect = `SELECT k.id,k.title_id AS "titleId",k.branch,k.copies,k.extras,k.revision,k.status,
  (SELECT identifier FROM kit_identifiers WHERE kit_id=k.id AND kind='kit') AS barcode,
  ARRAY(SELECT identifier FROM kit_identifiers WHERE kit_id=k.id AND kind='copy' ORDER BY identifier) AS components,
  ARRAY(SELECT label_id FROM title_label_assignments WHERE title_id=k.title_id ORDER BY label_id) AS "labelIds"
  FROM kits k`;
const linksSelect = 'SELECT club_id AS "clubId",kit_id AS "kitId" FROM club_kits ORDER BY club_id,kit_id';

module.exports = { titleColumns, clubColumns, kitSelect, linksSelect };
