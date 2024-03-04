import express from "express";
import cors from "cors";
import User from "../src/models/User";
import { Op } from "sequelize";
import swaggerJSDoc from "swagger-jsdoc";
import swaggerui from "swagger-ui-express";
const app = express();

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Identity Reconciliation", // Title (required)
      version: "1.0.0", // Version (required)
      description:
        "Identify and keep track of a customer's identity across multiple purchases", // Description (optional)
    },
    servers: [
      {
        url: "http://localhost:5000/", // URL (required)
      },
    ],
  },
  // Paths to the API docs
  apis: ["./src/app.ts"], // Path to the API docs (optional)
};

const specs = swaggerJSDoc(options);
app.use("/api-docs", swaggerui.serve, swaggerui.setup(specs));

app.set("port", process.env.PORT || 5000);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cors());
/**
 * @swagger
 * components:
 *   schemas:
 *     ContactRequest:
 *       type: object
 *       properties:
 *         email:
 *           type: string
 *         phoneNumber:
 *           type: string
 *     ContactResponse:
 *       type: object
 *       properties:
 *         primaryId:
 *           type: integer
 *         emails:
 *           type: array
 *           items:
 *             type: string
 *           description: Array containing emails of primary and secondary contacts.
 *         phoneNumbers:
 *           type: array
 *           items:
 *             type: string
 *           description: Array containing phone numbers of primary and secondary contacts.
 *         secondaryIds:
 *           type: array
 *           items:
 *             type: integer
 *           description: Array containing IDs of secondary contacts.
 */

/**
 * @swagger
 * /identify:
 *   post:
 *     summary: Identify primary and secondary contacts based on email and phone number.
 *     description: |
 *       This endpoint identifies primary and secondary contacts based on provided email and phone number.
 *       It handles scenarios where there are multiple primary records, finding the oldest one as primary
 *       and updating the rest as secondary. If no primary record exists, it creates one. If a primary
 *       record exists but with different email or phone number, it creates a new secondary record.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContactRequest'
 *     responses:
 *       200:
 *         description: Successful operation. Returns primary and secondary contacts.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ContactResponse'
 */

const isValidEmail = (email: string | null) => {
  return email === null || (email && email.length <= 255);
};

const isValidPhoneNumber = (phoneNumber: string | null) => {
  return phoneNumber === null || (phoneNumber && phoneNumber.length <= 15);
};

app.post("/identify", async (req, res) => {
  const { email, phoneNumber } = req.body;
  try {
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email address" });
    }

    if (!isValidPhoneNumber(phoneNumber)) {
      return res.status(400).json({ error: "Invalid phone number" });
    }

    let primaryContacts = [];
    let secondaryContacts = [];
    let primary;
    let secondary;

    // Here I am fetching all the primary records
    const primaryRecs = await User.findAll({
      where: {
        [Op.and]: [
          { [Op.or]: [{ email }, { phoneNumber }] },
          { linkPrecedence: "primary" },
          { linkedId: null },
        ],
      },
      order: [["createdAt", "ASC"]],
    });
    // if there are so many primary records then we need to find out which one is older and set it as primary and rest all as secondary and updating it's linkedId as of primary id
    if (primaryRecs.length > 1) {
      // Here I am updating all the newer records with secondary and keeping only oldest record one as primary
      const oldestRec = primaryRecs[0];
      const primaryRecIdsToUpdate = primaryRecs
        .filter(rec => rec.id !== oldestRec.id)
        .map(rec => rec.id);
      await User.update(
        {
          linkPrecedence: "secondary",
          linkedId: oldestRec.id,
        },
        {
          where: {
            id: primaryRecIdsToUpdate,
          },
          returning: true,
        }
      );

      primaryContacts.push(oldestRec);
      // Since update doesn't return individual updated records, So I have to find them by calling db again.
      const updatedSecondaryContacts = await User.findAll({
        where: { id: primaryRecIdsToUpdate },
      });

      secondaryContacts.push(...updatedSecondaryContacts);
    } else {
      // Since request didn't fit above criteria so I have move down in the else part and here I am finding the primary key wih email and phone number both
      primary = await User.findOne({
        where: {
          email: email,
          phoneNumber: phoneNumber,
          linkPrecedence: "primary",
        },
      });
      // Here with either email or phone number
      if (!primary) {
        primary = await User.findOne({
          where: {
            [Op.or]: [{ email: email }, { phoneNumber: phoneNumber }],
            linkPrecedence: "primary",
          },
        });
      }
      // Here I'm finding all the secondary records with both email and phone numbers
      secondary = await User.findAll({
        where: {
          email: email,
          phoneNumber: phoneNumber,
          linkPrecedence: "secondary",
        },
      });
      // If we didn't found secondary records then we are checking with either email or phone number
      if (secondary.length < 1) {
        secondary = await User.findAll({
          where: {
            [Op.or]: [{ email: email }, { phoneNumber: phoneNumber }],
            linkPrecedence: "secondary",
          },
        });
      }
      // if we didn't found the primary record but got one or multiple  secondary records then i am finding the primary records associated with the secondary records.Below condition can be improved if asked and explain about the requirement clearly.
      if (!primary && secondary.length > 0) {
        const linkedIds = secondary.map(contact => contact.linkedId);

        const associatedPrimary = await User.findAll({
          where: {
            id: linkedIds,
            linkPrecedence: "primary",
          },
        });
        console.log("associatedPrimary", linkedIds);
        if (associatedPrimary.length > 0) {
          primary = associatedPrimary[0];
        }
      }
      // If there is no secondary records and only primary records the am finding all the secondary records based on the primary id which are mathcing with the secondary
      if (secondary.length < 1 && primary) {
        secondary = await User.findAll({
          where: {
            linkedId: primary.dataValues.id,
          },
        });
      }
      // if till this stage we didn't find any primary records then we will create one
      if (!primary) {
        primary = await User.create({
          email: email,
          phoneNumber: phoneNumber,
          linkPrecedence: "primary",
        });
      }
      // This block of code checks if there are no existing secondary record entries and ensures there is a primary record.
      // If there's a primary record and either the provided email or phone number differs from the primary record data,
      // it creates a new secondary record entry linked to the primary record with the provided email and phone number.

      if (
        secondary.length < 1 &&
        primary &&
        ((email && primary.email !== email) ||
          (phoneNumber && primary.phoneNumber !== phoneNumber))
      ) {
        secondary = await User.create({
          email: email,
          phoneNumber: phoneNumber,
          linkedId: primary.id,
          linkPrecedence: "secondary",
        });
      }
      primaryContacts.push(primary);
      secondaryContacts.push(secondary);
    }
    // below code is just to return the response based on the requested format and also below code can be change according to the requested format, Since I have tested above code with almost all the edge cases and stred in the primary and secondary contacts array so if you want to make the below response in different way I can manupulate it and can deliver to you and also below i have not taken the unique emails since no where it is mention in the problem statement but i have taken for phone number.
    const primaryDetails = primaryContacts[0];
    const primaryId = primaryDetails.dataValues.id;
    const primaryEmail = primaryDetails.dataValues.email;
    const primaryPhone = primaryDetails.dataValues.phoneNumber;

    const secondaries = secondaryContacts.flat();
    const secondaryIds = secondaries.map(contact => contact.id);
    const secondaryEmails = secondaries.map(contact => contact.email);
    const secondaryPhones = secondaries.map(contact => contact.phoneNumber);
    const uniquePhones = Array.from(
      new Set([primaryPhone, ...secondaryPhones])
    );
    res.json({
      contact: {
        primaryId: primaryId,
        emails: [primaryEmail, ...secondaryEmails],
        phoneNumbers: uniquePhones,
        secondaryIds: secondaryIds,
      },
    });
  } catch (error) {
    // Handle any errors
    console.error("Error querying database:", error);
    throw error;
  }
});

export default app;
