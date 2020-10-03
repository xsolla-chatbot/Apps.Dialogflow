import { IHttp, IHttpRequest, IModify, IRead } from '@rocket.chat/apps-engine/definition/accessors';
import { IDialogflowEvent, DialogflowRequestType, IDialogflowMessage, LanguageCode, IDialogflowQuickReplies, DialogflowDataTransfer } from '../enum/Dialogflow';
import { Logs } from '../enum/Logs';
import { Headers } from '../enum/Http';
import { DialogflowClass, Dialogflow } from './Dialogflow';
import { performHandover, updateRoomCustomFields } from './Room';
import { createHttpRequest } from './Http';
import { IRoom } from '@rocket.chat/apps-engine/definition/rooms';


class DialogflowExtClass extends DialogflowClass {
    public async sendRequest(
        http: IHttp,
         read: IRead,
         modify: IModify,
         sessionId: string,
         request: IDialogflowEvent | string,
         requestType: DialogflowRequestType,
         visitorToken: string = ""): Promise<IDialogflowMessage> {

        const serverURL = await this.getServerURL(read, modify, http, sessionId);

        const queryInput = {
            ...requestType === DialogflowRequestType.EVENT && { event: request },
            ...requestType === DialogflowRequestType.MESSAGE && { text: { languageCode: LanguageCode.EN, text: request } },
        };

        const httpRequestContent: IHttpRequest = createHttpRequest(
            { 'Content-Type': Headers.CONTENT_TYPE_JSON, 'Accept': Headers.ACCEPT_JSON },
            { queryInput },
        );

        try {
            const response = await http.post(serverURL, httpRequestContent);
            this.doAsync(response.data, read, modify, http, sessionId, visitorToken);
            return this.parseRequest(response.data);
        } catch (error) {
            throw new Error(`${ Logs.HTTP_REQUEST_ERROR }`);
        }
    }

    public async sendRequestExt(
        http: IHttp,
         read: IRead,
         modify: IModify,
         sessionId: string,
         request: IDialogflowEvent | string,
         requestType: DialogflowRequestType,
         visitorToken: string = ""): Promise<IDialogflowMessage> {

        let messages: Array<string | IDialogflowQuickReplies> = [];

        const room: IRoom = await read.getRoomReader().getById(sessionId) as IRoom;
        if (!room) { throw new Error(Logs.INVALID_ROOM_ID); }

        const { customFields } = room;
        if (!customFields) {
            const welcome: IDialogflowEvent = {
                name: 'Welcome',
                languageCode: LanguageCode.EN
            }

            // Checks if this is the first message
            const message = await Dialogflow.sendRequest(http, read, modify, sessionId, welcome, DialogflowRequestType.EVENT);
            if(!message) { throw new Error(Logs.INVALID_MESSAGES) }
            messages = Object.assign(message.messages, messages);
        }

        const message = await this.sendRequest(http, read, modify, sessionId, request, DialogflowRequestType.MESSAGE, visitorToken);
        if(!message) { throw new Error(Logs.INVALID_MESSAGES) }

        if(message.messages) {
            message.messages.forEach(element => {
                messages.push(element);
            });
        }

        message.messages = messages;

        return message;
    }

    private async doAsync(response: any, read: IRead, modify: IModify, http: IHttp, sessionId: string, token: string) {
        if (!response) { throw new Error(Logs.INVALID_RESPONSE_FROM_DIALOGFLOW_CONTENT_UNDEFINED); }
        //fill visitor custom fields in livechat room
        await this.fillCustomFields(response, read, modify, token);
        //check is need execute handover
        this.executeHandover(response, read, modify, sessionId, token);
        this.dialogflowDataTransfer(read, modify, http, sessionId, token);
    }

    private async executeHandover(response: any, read: IRead, modify: IModify, sessionId: string, token: string) {
        const { queryResult: { parameters } } = response;

        if(!parameters)
            return;

        const { handover } = parameters;
        
        if(handover) {
            performHandover(modify, read, sessionId, token, handover);
        }
    }

    private async fillCustomFields(response: any, read: IRead, modify: IModify, token: string) {
        const vInfo = await this.getVisitorInfo(read, token);

        if(!vInfo) 
            return;
            
        const liveChatUpdater = modify.getUpdater().getLivechatUpdater();

        const { queryResult: { parameters } } = response;

        try {
            if(parameters) {
                for(let key in parameters) {
                    if(vInfo[key] != undefined) {
                        liveChatUpdater.setCustomFields(token, key, parameters[key], true);
                    }
                }
            }
        }
        catch(error) {
            throw new Error(Logs.INVALID_RESPONSE_FROM_DIALOGFLOW);
        }
    }


    private async dialogflowDataTransfer(read: IRead, modify: IModify, http: IHttp, sessionId: string, token: string) {

        const room: IRoom = await read.getRoomReader().getById(sessionId) as IRoom;
        if (!room) { throw new Error(Logs.INVALID_ROOM_ID); }

        const { customFields } = room;
        if (customFields) {
            let { isNotFirstMessage } = customFields as any;
            if (isNotFirstMessage) {
                // Checks if this is the first message
                return;
            }

            isNotFirstMessage = true;
            await updateRoomCustomFields(sessionId, { isNotFirstMessage }, read, modify);
        }

        const vInfo = await this.getVisitorInfo(read, token);

        if(!vInfo)
            return;
        
        let message = DialogflowDataTransfer.BEGIN + '';

        try {
            for(let key in vInfo) {
                message += key + ':' + vInfo[key] + ', ';
            }
        }
        catch(error) {
            throw new Error(`${Logs.DATA_TRANSFER_ERROR}:${error}`);
        }

        message += DialogflowDataTransfer.END + '';

        Dialogflow.sendRequest(http, read, modify, sessionId, message, DialogflowRequestType.MESSAGE);
    }
      

    public async executeCommand(http: IHttp,
        read: IRead,
        modify: IModify,
        sessionId: string,
        request: IDialogflowEvent | string,
        token: string = "") {

        let message : IDialogflowMessage = {
            isFallback: false
        };

        if(request == "getVI") {
            message = await this.prepeareMessage(JSON.stringify(await this.getVisitorInfo(read, token)));
        }

        if(request == "getAT") {
        	message = await this.prepeareMessage(JSON.stringify(await this.getAccessToken(read, modify, http, sessionId)));
        }

        if(request == "getRF") {
            message = await this.prepeareMessage(JSON.stringify(await this.getRoomFields(read, sessionId))); 
        }

        return message;
    }

    private async getVisitorInfo(read: IRead, token: string) {
        const visitor = await read.getLivechatReader().getLivechatVisitorByToken(token);
        if(!visitor) {throw new Error(Logs.INVALID_VISITOR_TOKEN); }
        

        return visitor.livechatData;
    } 

    private async getRoomFields(read: IRead, sessionId: string) {
        const room: IRoom = await read.getRoomReader().getById(sessionId) as IRoom;
        if (!room) { throw new Error(Logs.INVALID_ROOM_ID); }

        const { customFields } = room;

        return customFields;
    }

    private async prepeareMessage(m: string): Promise<IDialogflowMessage> {
        const message : IDialogflowMessage = {
            isFallback: false
        }

        let messages: Array<string | IDialogflowQuickReplies> = [];
        messages.push(m);

        message.messages = messages;

        return message;
    }
}

export const DialogflowExt = new DialogflowExtClass();