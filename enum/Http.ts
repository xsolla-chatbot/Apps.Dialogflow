export enum Headers {
    CONTENT_TYPE_JSON = 'application/json',
    CONTENT_TYPE_X_FORM_URL_ENCODED = 'application/x-www-form-urlencoded',
    ACCEPT_JSON = 'application/json',
}

export enum Response {
    SUCCESS = 'Your request was processed successfully',
}

export enum Request {
    GET_CUSTOM_FIELDS = 'http://localhost:3000/api/v1/livechat/custom-fields'
}
