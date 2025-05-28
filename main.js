require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { MongoClient, ObjectId } = require('mongodb');
const multer = require('multer');
const { GridFsStorage } = require('multer-gridfs-storage');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.use(express.json());
app.use(express.static('static'));
const MONGODB_URI = process.env.MONGODB_URL;
let gfs;
let db;
let mongoClient;

const storage = new GridFsStorage({
    url: MONGODB_URI,
    options: { useNewUrlParser: true, useUnifiedTopology: true },
    file: (req, file) => {
        return new Promise((resolve, reject) => {
            const filename = `${Date.now()}-${file.originalname}`;
            const fileInfo = {
                filename: filename,
                bucketName: 'uploads',
                metadata: {
                    originalname: file.originalname,
                    contentType: file.mimetype
                }
            };
            resolve(fileInfo);
        });
    }
});

const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === "image/png" || file.mimetype === "image/jpeg") {
            cb(null, true);
        } else {
            cb(new Error('Apenas PNG e JPEG são permitidos!'), false);
        }
    }
});

async function connectToMongo() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Mongoose connected successfully');
        
        const conn = mongoose.connection;
        gfs = new mongoose.mongo.GridFSBucket(conn.db, {
            bucketName: 'uploads'
        });
        
        mongoClient = new MongoClient(MONGODB_URI);
        await mongoClient.connect();
        db = mongoClient.db();
        
        console.log('MongoDB and GridFS initialized successfully');
        return mongoClient;
    } catch (err) {
        console.error('Error connecting to MongoDB:', err);
        throw err;
    }
}

app.post('/upload-image', upload.single('imagem'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    }
    console.log('File uploaded:', req.file);
    res.json({ 
        fileId: req.file.id ? req.file.id.toString() : req.file.filename,
        filename: req.file.filename 
    });
});

app.get('/', (req, res) => {
    res.redirect('/estoque.html');
});

app.get('/imagem/:id', async (req, res) => {
    try {
        const _id = new mongoose.Types.ObjectId(req.params.id);
        const collection = mongoose.connection.db.collection('uploads.files');
        const file = await collection.findOne({ _id });

        if (!file) {
            console.log('Imagem não encontrada');
            return res.status(404).json({ error: 'Imagem não encontrada' });
        }

        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: 'uploads'
        });

        res.set('Content-Type', file.contentType);
        bucket.openDownloadStream(_id).pipe(res);

    } catch (err) {
        console.error('Erro ao buscar imagem:', err);
        res.status(500).json({ error: 'Erro ao buscar imagem' });
    }
});

app.post('/add-equipment', async (req, res) => {
    try {
        const collection = db.collection('equipments');
        const data = req.body;
        
        console.log('Dados recebidos:', data); // Log para debug

        if (data.id) {
            const id = data.id;
            delete data.id;
            if (!data.imagemId) delete data.imagemId;
            
            console.log('Atualizando documento com imagemId:', data.imagemId);
            
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: data }
            );
            res.json({ message: 'Equipamento atualizado com sucesso' });
        } else {
            data.dataEntrada = new Date().toISOString().slice(0,10);
            data.status = 'Disponível';
            
            console.log('Inserindo novo documento com imagemId:', data.imagemId);
            
            await collection.insertOne(data);
            res.status(201).json({ message: 'Equipamento adicionado com sucesso' });
        }
    } catch (error) {
        console.error('Erro ao adicionar/editar equipamento:', error);
        res.status(500).json({ error: 'Erro ao adicionar/editar equipamento' });
    }
});

app.post('/withdraw-equipment', async (req, res) => {
    try {
        let { id, dataretirada, ultimoUsuario, observacao, quantidade } = req.body;
        quantidade = parseInt(quantidade, 10);

        const collection = db.collection('equipments');
        const equipamento = await collection.findOne({ _id: new ObjectId(id) });

        if (!equipamento) {
            return res.status(404).json({ error: 'Equipamento não encontrado para retirada.' });
        }

        const estoqueAtual = parseInt(equipamento.quantidade, 10) || 0;

        if (quantidade > estoqueAtual) {
            return res.status(400).json({ error: 'Quantidade de retirada maior que o estoque disponível.' });
        }

        const novoEstoque = estoqueAtual - quantidade;

        if (novoEstoque === 0) {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: {
                        status: 'Em uso',
                        dataretirada,
                        ultimoUsuario,
                        observacao
                    }
                }
            );
        } else {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { 
                    $set: { 
                        quantidade: novoEstoque,
                        status: 'Disponível'
                    }
                }
            );

            const novoEquipamento = {
                ...equipamento,
                _id: undefined,
                quantidade: quantidade,
                status: 'Em uso',
                dataretirada,
                ultimoUsuario,
                observacao,
                origemId: equipamento._id
            };
            delete novoEquipamento._id;
            await collection.insertOne(novoEquipamento);
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao retirar equipamento:', error);
        res.status(500).json({ error: 'Erro ao retirar equipamento' });
    }
});

app.post('/return-equipment', async (req, res) => {
    try {
        const { id } = req.body;
        const collection = db.collection('equipments');

        const docEmUso = await collection.findOne({ _id: new ObjectId(id) });
        if (!docEmUso) {
            return res.status(404).json({ error: 'Equipamento não encontrado para devolução.' });
        }

        if (docEmUso.status === 'Em uso' && docEmUso.ultimoUsuario && docEmUso.origemId) {
            const docOriginal = await collection.findOne({ _id: new ObjectId(docEmUso.origemId) });

            if (docOriginal) {
                await collection.updateOne(
                    { _id: docOriginal._id },
                    { $inc: { quantidade: docEmUso.quantidade }, $set: { status: 'Disponível' } }
                );
            } else {
                const novoDisponivel = { ...docEmUso, status: 'Disponível', ultimoUsuario: '', dataretirada: '', observacao: '' };
                delete novoDisponivel._id;
                await collection.insertOne(novoDisponivel);
            }

            await collection.deleteOne({ _id: new ObjectId(id) });

            return res.json({ success: true });
        } else {
            await collection.updateOne(
                { _id: new ObjectId(id) },
                { $set: { status: 'Disponível', dataretirada: '', ultimoUsuario: '' } }
            );
            return res.json({ success: true });
        }
    } catch (error) {
        console.error('Erro ao devolver equipamento:', error);
        res.status(500).json({ error: 'Erro ao devolver equipamento' });
    }
});

app.post('/delete-equipment', async (req, res) => {
    try {
        const { id } = req.body;
        const collection = db.collection('equipments');
        const result = await collection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            return res.status(404).json({ error: 'Equipamento não encontrado para exclusão.' });
        }
        res.json({ success: true });
    } catch (error) {
        console.error('Erro ao deletar equipamento:', error);
        res.status(500).json({ error: 'Erro ao deletar equipamento' });
    }
});

app.get('/get_all_equipaments', async (req, res) => {
    try {
        const collection = db.collection('equipments');
        const documents = await collection.find({}).toArray();
        const docsWithId = documents.map(doc => ({
            ...doc,
            id: doc._id.toString()
        }));
        res.json(docsWithId);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao buscar dados de auditoria' });
    }
});
async function startServer() {
    try {
        await connectToMongo();

        app.listen(PORT, HOST, () => {
            console.log(`Server running at http://${HOST}:${PORT}`);
            console.log(`Access inventory page at http://${HOST}:${PORT}/inventorypage.html`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();