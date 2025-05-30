import express from "express";
import bodyParser from "body-parser";
import db from "./db.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

await db.query(`
  CREATE TABLE IF NOT EXISTS Contacts (
    id SERIAL PRIMARY KEY,
    phoneNumber VARCHAR(255),
    email VARCHAR(255),
    linkedId INTEGER,
    linkPrecedence VARCHAR(10) NOT NULL DEFAULT 'primary' CHECK (linkPrecedence IN ('primary', 'secondary')),
    createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deletedAt TIMESTAMPTZ
  );
`);

app.post("/identify", async (req, res) => {
  const { email = null, phoneNumber = null } = req.body;

  if (!email && !phoneNumber) {
    return res.status(400).json({ error: "Email or phoneNumber is required" });
  }

  try {
    const result = await db.query(`
      SELECT * FROM Contacts 
      WHERE (email = $1 OR phoneNumber = $2) AND deletedAt IS NULL
    `, [email, phoneNumber]);

    const contacts = result.rows;

    if (contacts.length === 0) {
      const insertRes = await db.query(`
        INSERT INTO Contacts (email, phoneNumber, linkPrecedence)
        VALUES ($1, $2, 'primary') RETURNING *;
      `, [email, phoneNumber]);

      const contact = insertRes.rows[0];
      return res.status(200).json({
        contact: {
          primaryContactId: contact.id,
          emails: [contact.email],
          phoneNumbers: [contact.phonenumber],
          secondaryContactIds: []
        }
      });
    }

    let primaryContact = contacts.find(c => c.linkprecedence === 'primary');
    if (!primaryContact) {
      primaryContact = await db.query(`SELECT * FROM Contacts WHERE id = $1`, [contacts[0].linkedid]);
      primaryContact = primaryContact.rows[0];
    }

    const alreadyExists = contacts.some(c => c.email === email && c.phoneNumber === phoneNumber);

    if (!alreadyExists) {
      await db.query(`
        INSERT INTO Contacts (email, phoneNumber, linkPrecedence, linkedId)
        VALUES ($1, $2, 'secondary', $3);
      `, [email, phoneNumber, primaryContact.id]);
    }

    const relatedContactsRes = await db.query(`
      SELECT * FROM Contacts 
      WHERE id = $1 OR linkedId = $1 AND deletedAt IS NULL
    `, [primaryContact.id]);

    const relatedContacts = relatedContactsRes.rows;

    const emails = [...new Set(relatedContacts.map(c => c.email).filter(e => e))];
    const phoneNumbers = [...new Set(relatedContacts.map(c => c.phonenumber).filter(p => p))];
    const secondaryContactIds = relatedContacts
      .filter(c => c.linkprecedence === 'secondary')
      .map(c => c.id);

    res.status(200).json({
      contact: {
        primaryContactId: primaryContact.id,
        emails,
        phoneNumbers,
        secondaryContactIds
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.get("/showcontacts", async (req, res) => {
  try {
    const result = await db.query(
      `SELECT * FROM Contacts WHERE deletedAt IS NULL ORDER BY id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

app.delete("/deletecontacts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      `UPDATE Contacts SET deletedAt = NOW(), updatedAt = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Contact not found" });
    }
    res.json({ message: "Contact soft deleted", contact: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete contact" });
  }
});


app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

