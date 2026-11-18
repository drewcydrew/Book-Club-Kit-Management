const titleColumns = 'id,name,author,isbn,pages,genres,notes,large_print AS "largePrint",audio,cover_url AS "coverUrl",publisher,synopsis,date_published AS "datePublished",binding,language,revision';
const clubColumns = 'id,name,branch,size,cadence,pickup,address,revision';
const kitSelect = `SELECT k.id,k.title_id AS "titleId",k.branch,k.copies,k.extras,k.revision,k.status,
  (SELECT identifier FROM kit_identifiers WHERE kit_id=k.id AND kind='kit') AS barcode,
  ARRAY(SELECT identifier FROM kit_identifiers WHERE kit_id=k.id AND kind='copy' ORDER BY identifier) AS components,
  ARRAY(SELECT label_id FROM kit_label_assignments WHERE kit_id=k.id ORDER BY label_id) AS "labelIds"
  FROM kits k`;
const linksSelect = 'SELECT club_id AS "clubId",kit_id AS "kitId" FROM club_kits ORDER BY club_id,kit_id';

module.exports = { titleColumns, clubColumns, kitSelect, linksSelect };
