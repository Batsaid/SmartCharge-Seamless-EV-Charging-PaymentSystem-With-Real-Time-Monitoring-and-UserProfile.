const express = require('express');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const port = 3000;

// Middleware to parse JSON bodies and URL-encoded form bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Replace with your actual MongoDB Atlas connection string
const mongoURI = 'mongodb://localhost:27017/myevdata';

mongoose.connect(mongoURI)
    .then(() => {
        console.log('Connected to MongoDB Atlas');
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server is running on port ${port}`);
        });
    })
    .catch(err => {
        console.error('Error connecting to MongoDB Atlas:', err);
    });

// Define a schema for status
const statusSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    status: { type: String, required: true },
    voltage: { type: Number, default: null },
    current: { type: Number, default: null },
    receivedAt: { type: Date, default: Date.now }
});
const Status = mongoose.model('Status', statusSchema, 'status');

// Define a schema for vehicle/payment data
const vehicleSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    vehicleNumber: { type: String, required: true },
    vehicleModel: { type: String, required: true },
    amount: { type: Number, required: true },
    totaltime: { type: Number, required: true },
    reminingtime: { type: Number, required: true },
    timestamp: { type: Date, default: Date.now }
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema, 'myevdata');



app.get('/api/status', async (req, res) => {
    const queryStatus = req.query.status;
    const voltageQuery = req.query.voltage;
    const currentQuery = req.query.current;

    // Build an update object if any values are provided in the query string
    let update = {};
    if (queryStatus) {
        update.status = queryStatus;
        update.receivedAt = Date.now();
    }
    if (voltageQuery !== undefined) {
        update.voltage = parseFloat(voltageQuery);
    }
    if (currentQuery !== undefined) {
        update.current = parseFloat(currentQuery);
    }

    // If an update is needed, update the document
    if (Object.keys(update).length) {
        try {
            const updatedStatus = await Status.findByIdAndUpdate(
                "status",
                update,
                { upsert: true, new: true }
            );
            return res.json({ success: true, message: 'Status updated successfully', status: updatedStatus.status, voltage: updatedStatus.voltage, current: updatedStatus.current });
        } catch (err) {
            console.error("Error updating status:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    } else {
        // Return the current status document with voltage and current fields
        try {
            const currentStatus = await Status.findById("status");
            if (currentStatus) {
                return res.json({
                    success: true,
                    status: currentStatus.status,
                    voltage: currentStatus.voltage,
                    current: currentStatus.current
                });
            } else {
                return res.json({ success: false, message: "No status found" });
            }
        } catch (err) {
            console.error("Error fetching status:", err);
            return res.status(500).json({ success: false, message: "Server error" });
        }
    }
});

/**
 * POST /api/status
 * Updates or creates the status document.
 */
app.post('/api/status', async (req, res) => {
    const { status, voltage, current } = req.body;
    if (!status) {
        return res.status(400).json({ success: false, message: 'Missing status in request body' });
    }

    // Build update object with provided values
    let update = { status, receivedAt: Date.now() };
    if (voltage !== undefined) {
        update.voltage = parseFloat(voltage);
    }
    if (current !== undefined) {
        update.current = parseFloat(current);
    }

    try {
        await Status.findByIdAndUpdate(
            "status",
            update,
            { upsert: true, new: true }
        );
        res.json({ success: true, message: 'Status updated successfully' });
    } catch (err) {
        console.error('Error updating status:', err);
        res.status(500).json({ success: false, message: 'Error updating status in database' });
    }
});



/**
 * GET /
 * Serves different pages based on the EV status.
 */
app.get('/', async (req, res) => {
    try {
        const currentStatus = await Status.findById("status");
        if (currentStatus && currentStatus.status === "Connected") {
            res.sendFile(path.join(__dirname, 'profile.html'));
        } else {
            res.sendFile(path.join(__dirname, 'index.html'));
        }
    } catch (err) {
        console.error(err);
        res.sendFile(path.join(__dirname, 'index.html'));
    }
});

/**
 * POST /pay
 * Processes the payment and updates or inserts vehicle data.
 */
/**
 * POST /pay
 * Processes the payment and updates or inserts vehicle data.
 * If the same vehicle pays again and its remaining time is not zero,
 * add the new time to the existing remaining time and update the total time.
 * Also, update the EV status to "Charging".
 */
app.post('/pay', async (req, res) => {
    let { vehicleNumber, vehicleModel, amount } = req.body;

    // Convert amount to a number
    amount = parseFloat(amount);
    if (isNaN(amount) || amount <= 0) {
        return res.status(400).send("Invalid amount");
    }

    // Calculate new time based on current payment (each ₹10 gives 1 minute)
    const newTime = Math.floor(amount / 10);

    try {
        // Check if the vehicle already exists
        const existingVehicle = await Vehicle.findById(vehicleNumber);

        let updatedVehicle;
        if (existingVehicle && existingVehicle.reminingtime > 0) {
            // If vehicle exists and remaining time is not zero,
            // add new time to the existing totaltime and reminingtime,
            // and add the new amount to the existing amount.
            updatedVehicle = await Vehicle.findByIdAndUpdate(
                vehicleNumber,
                {
                    vehicleNumber,
                    vehicleModel,
                    amount: amount,
                    totaltime: existingVehicle.reminingtime + newTime,
                    reminingtime: existingVehicle.reminingtime + newTime,
                    timestamp: new Date()
                },
                { upsert: true, new: true }
            );
        } else {
            // Otherwise, create new vehicle data
            updatedVehicle = await Vehicle.findByIdAndUpdate(
                vehicleNumber,
                {
                    vehicleNumber,
                    vehicleModel,
                    amount,
                    totaltime: newTime,
                    reminingtime: newTime,
                    timestamp: new Date()
                },
                { upsert: true, new: true }
            );
        }

        // Update the EV status to "Charging" in the status collection.
        /* await Status.findByIdAndUpdate(
             "status",
             { status: "Charging", receivedAt: Date.now() },
             { upsert: true, new: true }
         );
 */
        // Redirect to the countdown page.
        res.redirect(`/waiting.html?vehicleNumber=${vehicleNumber}`);
    } catch (err) {
        console.error("Error processing payment data:", err);
        res.status(500).send("Error saving data");
    }
});




app.get('/api/get-vehicle', async (req, res) => {
    const { vehicleNumber } = req.query;

    try {
        const vehicle = await Vehicle.findById(vehicleNumber);
        if (!vehicle) {
            return res.json({ success: false, message: "Vehicle not found" });
        }
        res.json({ success: true, vehicle });
    } catch (err) {
        console.error("Error fetching vehicle:", err);
        res.status(500).json({ success: false, message: "Database error" });
    }
});


app.post('/api/update-time', async (req, res) => {
    const { vehicleNumber, reminingtime } = req.body;
    try {
        await Vehicle.findByIdAndUpdate(vehicleNumber, { reminingtime });

        res.json({ success: true, message: "Remaining time updated" });

        if (reminingtime <= 0) {
            await Status.findByIdAndUpdate("status", { status: "Finished" });
        }
    } catch (err) {
        console.error('Error updating time:', err);
        res.status(500).json({ success: false, message: "Error updating time" });
    }
});


